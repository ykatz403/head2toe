using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Head2Toe.Api.Data;

namespace Head2Toe.Api.Services;

public record PickedItem(int Id, string Slot, string Reason);

/// <summary>
/// Turns a free-text description ("a casual navy blazer for a fall wedding") into a pick from our small
/// real-photo seed catalog, using Claude (Haiku - this is a cheap, fast, structured-extraction task, not
/// something that needs a large model). The catalog is small enough to hand to the model in full each
/// time rather than building separate search/embedding infrastructure.
/// </summary>
public class PreferencePicker
{
    readonly HttpClient _http;
    readonly ILogger<PreferencePicker> _log;

    public PreferencePicker(HttpClient http, IConfiguration config, ILogger<PreferencePicker> log)
    {
        _http = http;
        _log = log;
        _http.BaseAddress = new Uri("https://api.anthropic.com/v1/");
        var key = config["Anthropic:ApiKey"];
        if (!string.IsNullOrWhiteSpace(key))
        {
            _http.DefaultRequestHeaders.Add("x-api-key", key);
            _http.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");
        }
    }

    public bool Configured => _http.DefaultRequestHeaders.Contains("x-api-key");

    public async Task<(List<PickedItem>? Picks, string? Error)> PickAsync(string freeText, List<Product> catalog, CancellationToken ct)
    {
        if (!Configured) return (null, "The style search isn't configured yet. Set ANTHROPIC_API_KEY.");
        if (string.IsNullOrWhiteSpace(freeText)) return (null, "Describe what you're looking for.");

        var catalogText = string.Join("\n", catalog.Select(p => $"id={p.Id} | category={p.Slot} | \"{p.Name}\" by {p.Brand} | ${p.Price}"));
        var prompt = $$"""
            A shopper described what they want: "{{freeText}}"

            Here is the entire product catalog available (small on purpose):
            {{catalogText}}

            Pick the single best-matching item for each distinct garment category the shopper's description
            reasonably calls for (usually just one category, sometimes two - e.g. "a shirt and pants for..."
            calls for both). Never invent an id that isn't listed. If nothing in the catalog is a reasonable
            match for a category the shopper wants, omit that category rather than forcing a bad pick.

            Respond with ONLY a JSON array, no other text, in this exact shape:
            [{"id": 3, "slot": "shirt", "reason": "one short phrase explaining the pick"}]
            """;

        var body = new
        {
            model = "claude-haiku-4-5-20251001",
            max_tokens = 512,
            messages = new[] { new { role = "user", content = prompt } },
        };

        HttpResponseMessage res;
        try
        {
            res = await _http.PostAsJsonAsync("messages", body, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _log.LogWarning(ex, "Could not reach Anthropic");
            return (null, "Could not reach the style search. Check your connection and try again.");
        }
        if (!res.IsSuccessStatusCode)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            _log.LogWarning("Anthropic rejected the request: {Status} {Body}", res.StatusCode, text);
            return (null, "The style search couldn't process that. Try describing it differently.");
        }

        var payload = await res.Content.ReadFromJsonAsync<MessagesResponse>(cancellationToken: ct);
        var raw = payload?.Content?.FirstOrDefault(c => c.Type == "text")?.Text;
        if (string.IsNullOrWhiteSpace(raw)) return (null, "The style search returned nothing usable. Try again.");

        try
        {
            // The model sometimes wraps the array in prose despite instructions; take the first [...] block.
            var start = raw.IndexOf('[');
            var end = raw.LastIndexOf(']');
            var json = start >= 0 && end > start ? raw[start..(end + 1)] : raw;
            var picks = JsonSerializer.Deserialize<List<PickedItem>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (picks is null || picks.Count == 0) return (null, "Nothing in the current sample catalog matched that. Try a different description.");
            var validIds = catalog.Select(p => p.Id).ToHashSet();
            var filtered = picks.Where(p => validIds.Contains(p.Id)).ToList();
            return filtered.Count > 0 ? (filtered, null) : (null, "Nothing in the current sample catalog matched that. Try a different description.");
        }
        catch (JsonException ex)
        {
            _log.LogWarning(ex, "Could not parse Anthropic's response: {Raw}", raw);
            return (null, "The style search's answer couldn't be understood. Try again.");
        }
    }

    record ContentBlock([property: JsonPropertyName("type")] string Type, [property: JsonPropertyName("text")] string? Text);
    record MessagesResponse([property: JsonPropertyName("content")] List<ContentBlock>? Content);
}
