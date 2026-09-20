using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Head2Toe.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Head2Toe.Api.Tests;

/// <summary>The catalog is the contract with the 3D avatar: every attribute value must be one the renderer knows.</summary>
public class CatalogContractTests
{
    static readonly Dictionary<string, (string Key, string[] Allowed)> Rules = new()
    {
        ["hat"] = ("shape", ["cap", "beanie", "straw"]),
        ["under"] = ("sleeve", ["short", "long"]),
        ["top"] = ("sleeve", ["short", "long"]),
        ["pants"] = ("len", ["short", "long"]),
        ["socks"] = ("sock", ["low", "crew"]),
        ["shoes"] = ("type", ["sneaker", "loafer", "boot", "slide"]),
    };
    static readonly string[] Slots = ["hat", "glasses", "under", "top", "outer", "pants", "boxers", "socks", "shoes"];

    static readonly List<Product> All = Seed.Catalog().ToList();

    [Fact] public void Catalog_is_not_empty() => Assert.True(All.Count >= 70);

    [Fact]
    public void Every_product_has_valid_basic_fields()
    {
        foreach (var p in All)
        {
            var who = $"{p.Season}/{p.Slot}/{p.Name}";
            Assert.Contains(p.Season, new[] { "summer", "winter", "pool" });
            Assert.Contains(p.Slot, Slots);
            Assert.Contains(p.Tier, new[] { "lux", "std" });
            Assert.True(p.Price > 0, who);
            Assert.False(string.IsNullOrWhiteSpace(p.Name) || string.IsNullOrWhiteSpace(p.Brand), who);
            Assert.Matches(new Regex("^#[0-9a-fA-F]{6}$"), p.Color);
            Assert.True(Uri.TryCreate(p.Url, UriKind.Absolute, out var u) && u.Scheme == "https", $"{who} needs an https url");
        }
    }

    [Fact]
    public void Every_attribute_is_one_the_avatar_can_draw()
    {
        foreach (var p in All)
        {
            var attrs = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(p.AttrsJson)!;
            var who = $"{p.Season}/{p.Slot}/{p.Name}";
            if (Rules.TryGetValue(p.Slot, out var rule))
            {
                Assert.True(attrs.TryGetValue(rule.Key, out var v), $"{who} is missing '{rule.Key}'");
                Assert.Contains(v.GetString(), rule.Allowed);
            }
            if (p.Slot == "outer") Assert.True(attrs["coat"].ValueKind is JsonValueKind.True or JsonValueKind.False, who);
            if (p.Slot == "glasses") Assert.Matches(new Regex("^#[0-9a-fA-F]{3,6}$"), attrs["lens"].GetString()!);
        }
    }

    [Fact]
    public void Every_season_has_both_designer_and_everyday_options_for_the_core_pieces()
    {
        foreach (var season in new[] { "summer", "winter", "pool" })
            foreach (var slot in new[] { "top", "pants", "shoes" })
                foreach (var tier in new[] { "lux", "std" })
                    Assert.True(All.Any(p => p.Season == season && p.Slot == slot && p.Tier == tier), $"{season}/{slot}/{tier}");
    }

    [Fact]
    public void Season_rules_hold_no_coats_in_summer_and_pool_no_winter_boots_by_the_pool()
    {
        Assert.DoesNotContain(All, p => p.Season != "winter" && p.Slot == "outer");
        Assert.DoesNotContain(All, p => p.Season == "pool" && p.Slot is "under" or "boxers" or "socks");
        Assert.DoesNotContain(All, p => p.Season == "winter" && p.Slot == "shoes" && !p.AttrsJson.Contains("boot"));
    }

    [Fact]
    public void No_duplicate_products_within_a_season_and_slot()
    {
        var dupes = All.GroupBy(p => (p.Season, p.Slot, p.Brand, p.Name)).Where(g => g.Count() > 1);
        Assert.Empty(dupes);
    }
}

public class ClickTests(ApiFactory f) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Go_redirects_to_the_retailer_and_logs_the_click()
    {
        var c = f.NoRedirectClient();
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var product = await db.Products.FirstAsync();
        var before = await db.Clicks.CountAsync(x => x.ProductId == product.Id);

        var res = await c.GetAsync($"/go/{product.Id}");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        Assert.Equal(product.Url.TrimEnd('/'), res.Headers.Location!.ToString().TrimEnd('/'));

        using var scope2 = f.Services.CreateScope();
        var after = await scope2.ServiceProvider.GetRequiredService<AppDb>().Clicks.CountAsync(x => x.ProductId == product.Id);
        Assert.Equal(before + 1, after);
    }

    [Theory] [InlineData(999999)] [InlineData(0)] [InlineData(-1)]
    public async Task Unknown_product_is_404_and_logs_nothing(int id)
    {
        var res = await f.NoRedirectClient().GetAsync($"/go/{id}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Go_never_redirects_anywhere_except_the_stored_retailer_url()
    {
        // The redirect target comes only from the database, never from the request, so it can't be used as an open redirect.
        var res = await f.NoRedirectClient().GetAsync("/go/1?url=https://evil.example&next=https://evil.example");
        Assert.DoesNotContain("evil.example", res.Headers.Location?.ToString() ?? "");
    }

    [Fact]
    public async Task Long_referrers_are_truncated_not_rejected()
    {
        var c = f.NoRedirectClient();
        var req = new HttpRequestMessage(HttpMethod.Get, "/go/1");
        req.Headers.TryAddWithoutValidation("Referer", "https://example.com/" + new string('a', 3000));
        Assert.Equal(HttpStatusCode.Redirect, (await c.SendAsync(req)).StatusCode);
    }
}
