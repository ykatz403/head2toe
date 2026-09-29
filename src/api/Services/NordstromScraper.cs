using Microsoft.Playwright;

namespace Head2Toe.Api.Services;

public record ScrapedProduct(string Name, string? Brand, decimal? Price, string ImageUrl, string ProductUrl);

/// <summary>
/// Pulls real, live product data (name, price, photo, link) from Nordstrom's search results using a real
/// headless browser - plain HTTP requests get blocked outright by their bot protection, but a browser that
/// looks like a real one gets through. This is POC-only: the production-correct way to get licensed product
/// data is an affiliate feed (Awin, Rakuten), which needs no scraping and comes with permission to use the
/// images. Nordstrom's search results render client-side and aren't always instantly ready, so this expects
/// occasional retries rather than 100% reliability.
/// </summary>
public class NordstromScraper : IAsyncDisposable
{
    readonly ILogger<NordstromScraper> _log;
    IPlaywright? _playwright;
    IBrowser? _browser;

    public NordstromScraper(ILogger<NordstromScraper> log) => _log = log;

    async Task<IBrowser> GetBrowserAsync()
    {
        _playwright ??= await Playwright.CreateAsync();
        _browser ??= await _playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
        {
            Headless = true,
            Args = ["--disable-blink-features=AutomationControlled"],
        });
        return _browser;
    }

    public async Task<List<ScrapedProduct>> SearchAsync(string keyword, int maxResults, CancellationToken ct)
    {
        var browser = await GetBrowserAsync();
        await using var context = await browser.NewContextAsync(new BrowserNewContextOptions
        {
            UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            ViewportSize = new ViewportSize { Width = 1366, Height = 900 },
            Locale = "en-US",
            TimezoneId = "America/New_York",
        });
        await context.AddInitScriptAsync("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });");
        var page = await context.NewPageAsync();

        var url = $"https://www.nordstrom.com/sr?keyword={Uri.EscapeDataString(keyword)}";
        const int attempts = 3;
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                await page.GotoAsync(url, new PageGotoOptions { Timeout = 25000, WaitUntil = WaitUntilState.DOMContentLoaded });
                await page.WaitForSelectorAsync("a[href*='/s/'] img[alt]", new PageWaitForSelectorOptions { Timeout = 20000 });
                await page.WaitForTimeoutAsync(500); // let the rest of the tile (price) settle in

                var raw = await page.EvalOnSelectorAllAsync<string[]>(
                    "a[href*='/s/']",
                    """
                    els => els.map(a => {
                        const img = a.querySelector('img[alt]');
                        if (!img || !img.src || img.naturalWidth < 50) return null;
                        const priceText = (a.innerText.match(/\$[\d,]+(\.\d{2})?/) || [null])[0];
                        return JSON.stringify({
                            name: img.alt,
                            image: img.currentSrc || img.src,
                            url: a.href,
                            price: priceText,
                        });
                    }).filter(Boolean)
                    """
                );
                var seen = new HashSet<string>();
                var results = new List<ScrapedProduct>();
                foreach (var json in raw)
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    var name = root.GetProperty("name").GetString() ?? "";
                    var image = root.GetProperty("image").GetString() ?? "";
                    var productUrl = root.GetProperty("url").GetString() ?? "";
                    if (name.Length == 0 || image.Length == 0 || !seen.Add(productUrl)) continue;
                    var priceText = root.TryGetProperty("price", out var p) ? p.GetString() : null;
                    decimal? price = priceText is not null && decimal.TryParse(priceText.TrimStart('$').Replace(",", ""), out var d) ? d : null;
                    results.Add(new ScrapedProduct(name, "Nordstrom", price, image, productUrl));
                    if (results.Count >= maxResults) break;
                }
                return results;
            }
            catch (Exception ex) when (attempt < attempts && ex is TimeoutException or PlaywrightException)
            {
                _log.LogWarning(ex, "Nordstrom search attempt {Attempt} failed for {Keyword}, retrying", attempt, keyword);
            }
        }
        return [];
    }

    public async ValueTask DisposeAsync()
    {
        if (_browser is not null) await _browser.DisposeAsync();
        _playwright?.Dispose();
    }
}
