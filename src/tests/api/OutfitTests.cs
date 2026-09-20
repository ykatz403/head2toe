using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Head2Toe.Api.Services;

namespace Head2Toe.Api.Tests;

public class OutfitTests(ApiFactory f) : IClassFixture<ApiFactory>
{
    static readonly string[] SlotOrder = ["hat", "glasses", "under", "top", "outer", "pants", "boxers", "socks", "shoes"];

    async Task<OutfitDto> Get(string q) => (await f.CreateClient().GetFromJsonAsync<OutfitDto>($"/api/outfit{q}"))!;

    public static IEnumerable<object[]> AllCombos() =>
        from s in new[] { "summer", "winter", "pool" } from t in new[] { "lux", "std", "both" } select new object[] { s, t };

    [Fact]
    public async Task Defaults_to_a_summer_look_for_both_tiers()
    {
        var o = await Get("");
        Assert.Equal(("summer", "both", 0), (o.Season, o.Tier, o.Seed));
    }

    [Theory, MemberData(nameof(AllCombos))]
    public async Task Every_season_and_tier_returns_all_nine_slots_in_order(string season, string tier)
    {
        var o = await Get($"?season={season}&tier={tier}");
        Assert.Equal(SlotOrder, o.Items.Select(i => i.Slot));
        Assert.All(o.Items, i => Assert.True((i.Product is null) != (i.Note is null), $"{i.Slot} must have either a product or a reason"));
        Assert.Contains(o.Items, i => i.Product != null); // never an empty look
    }

    [Theory, MemberData(nameof(AllCombos))]
    public async Task Total_equals_the_sum_of_the_pieces(string season, string tier)
    {
        var o = await Get($"?season={season}&tier={tier}&seed=2");
        Assert.Equal(o.Items.Sum(i => i.Product?.Price ?? 0), o.Total);
    }

    [Theory]
    [InlineData("summer")] [InlineData("winter")] [InlineData("pool")]
    public async Task Designer_looks_contain_only_designer_pieces_and_everyday_only_everyday(string season)
    {
        foreach (var seed in new[] { 0, 1, 2, 3 })
        {
            Assert.All((await Get($"?season={season}&tier=lux&seed={seed}")).Items.Where(i => i.Product != null), i => Assert.Equal("lux", i.Product!.Tier));
            Assert.All((await Get($"?season={season}&tier=std&seed={seed}")).Items.Where(i => i.Product != null), i => Assert.Equal("std", i.Product!.Tier));
        }
    }

    [Fact]
    public async Task Both_mixes_designer_and_everyday()
    {
        var tiers = new HashSet<string>();
        for (var seed = 0; seed < 4; seed++)
            foreach (var i in (await Get($"?season=summer&tier=both&seed={seed}")).Items.Where(i => i.Product != null))
                tiers.Add(i.Product!.Tier);
        Assert.Equal(new HashSet<string> { "lux", "std" }, tiers);
    }

    [Fact]
    public async Task Same_seed_gives_the_same_look_and_a_new_seed_changes_it()
    {
        var a = await Get("?season=winter&tier=both&seed=5");
        var b = await Get("?season=winter&tier=both&seed=5");
        var c = await Get("?season=winter&tier=both&seed=6");
        Assert.Equal(a.Items.Select(i => i.Product?.Id), b.Items.Select(i => i.Product?.Id));
        Assert.NotEqual(a.Items.Select(i => i.Product?.Id), c.Items.Select(i => i.Product?.Id));
    }

    [Theory] [InlineData(-1)] [InlineData(-999)] [InlineData(int.MaxValue)] [InlineData(int.MinValue + 1)]
    public async Task Extreme_seeds_do_not_crash(int seed)
    {
        var res = await f.CreateClient().GetAsync($"/api/outfit?season=pool&tier=both&seed={seed}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Pool_days_skip_layers_with_a_reason()
    {
        var o = await Get("?season=pool&tier=both");
        foreach (var slot in new[] { "under", "outer", "boxers", "socks" })
        {
            var item = o.Items.Single(i => i.Slot == slot);
            Assert.Null(item.Product);
            Assert.False(string.IsNullOrWhiteSpace(item.Note));
        }
        Assert.NotNull(o.Items.Single(i => i.Slot == "pants").Product); // swim shorts
    }

    [Fact]
    public async Task Winter_skips_glasses_and_summer_skips_the_coat()
    {
        Assert.Null((await Get("?season=winter")).Items.Single(i => i.Slot == "glasses").Product);
        Assert.Null((await Get("?season=summer")).Items.Single(i => i.Slot == "outer").Product);
        Assert.NotNull((await Get("?season=winter")).Items.Single(i => i.Slot == "outer").Product);
    }

    [Theory]
    [InlineData("?season=fall")] [InlineData("?tier=cheap")] [InlineData("?season=SUMMER")] [InlineData("?season=summer;drop table")]
    public async Task Unknown_season_or_tier_is_a_400(string q)
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await f.CreateClient().GetAsync($"/api/outfit{q}")).StatusCode);
    }

    [Fact]
    public async Task Every_product_links_through_the_tracked_redirect()
    {
        var o = await Get("?season=summer&tier=both");
        Assert.All(o.Items.Where(i => i.Product != null), i => Assert.Equal($"/go/{i.Product!.Id}", i.Product!.ShopUrl));
    }

    [Fact]
    public async Task Response_is_camel_cased_json_the_frontend_expects()
    {
        var json = await f.CreateClient().GetStringAsync("/api/outfit");
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        foreach (var k in new[] { "season", "tier", "seed", "total", "items" }) Assert.True(root.TryGetProperty(k, out _), k);
        var first = root.GetProperty("items").EnumerateArray().First(i => i.GetProperty("product").ValueKind == JsonValueKind.Object).GetProperty("product");
        foreach (var k in new[] { "id", "slot", "brand", "name", "price", "color", "tier", "attrs", "shopUrl" }) Assert.True(first.TryGetProperty(k, out _), k);
    }
}
