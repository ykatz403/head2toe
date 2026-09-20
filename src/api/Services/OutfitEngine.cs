using System.Text.Json;
using Head2Toe.Api.Data;

namespace Head2Toe.Api.Services;

public record ProductDto(int Id, string Slot, string Brand, string Name, decimal Price, string Color, string Tier,
    Dictionary<string, JsonElement> Attrs, string ShopUrl);

public record OutfitItem(string Slot, string Label, ProductDto? Product, string? Note);

public record OutfitDto(string Season, string Tier, int Seed, decimal Total, List<OutfitItem> Items);

public static class OutfitEngine
{
    public static readonly (string Slot, string Label)[] Slots =
    [
        ("hat", "Hat"), ("glasses", "Glasses"), ("under", "Undershirt"), ("top", "Shirt"), ("outer", "Outer layer"),
        ("pants", "Pants"), ("boxers", "Underwear"), ("socks", "Socks"), ("shoes", "Shoes"),
    ];

    public static readonly string[] Seasons = ["summer", "winter", "pool"];
    public static readonly string[] Tiers = ["lux", "std", "both"];

    static readonly Dictionary<string, Dictionary<string, string>> Notes = new()
    {
        ["summer"] = new() { ["outer"] = "Not needed in the heat" },
        ["winter"] = new() { ["glasses"] = "Optional in winter, skipped" },
        ["pool"] = new()
        {
            ["under"] = "Skipped for the pool", ["outer"] = "Skipped for the pool",
            ["boxers"] = "Swim shorts have a liner", ["socks"] = "Bare feet by the pool",
        },
    };

    public static ProductDto ToDto(Product p) => new(p.Id, p.Slot, p.Brand, p.Name, p.Price, p.Color, p.Tier,
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(p.AttrsJson) ?? [], $"/go/{p.Id}");

    /// <summary>Picks one product per slot. Same seed always gives the same look, a new seed shuffles it.</summary>
    public static OutfitDto Build(IReadOnlyList<Product> all, string season, string tier, int seed)
    {
        var items = new List<OutfitItem>();
        var i = 0;
        foreach (var (slot, label) in Slots)
        {
            var pool = all.Where(p => p.Season == season && p.Slot == slot).OrderBy(p => p.Id).ToList();
            if (tier != "both") pool = pool.Where(p => p.Tier == tier).ToList();
            else pool = Interleave(pool);

            if (pool.Count == 0)
            {
                string? note = null;
                Notes.GetValueOrDefault(season)?.TryGetValue(slot, out note);
                items.Add(new OutfitItem(slot, label, null, note ?? "Not part of this look"));
            }
            else
            {
                var pick = pool[((seed + i) % pool.Count + pool.Count) % pool.Count];
                items.Add(new OutfitItem(slot, label, ToDto(pick), null));
            }
            i++;
        }
        return new OutfitDto(season, tier, seed, items.Sum(x => x.Product?.Price ?? 0), items);
    }

    static List<Product> Interleave(List<Product> pool)
    {
        var std = pool.Where(p => p.Tier == "std").ToList();
        var lux = pool.Where(p => p.Tier == "lux").ToList();
        var result = new List<Product>();
        for (var k = 0; k < Math.Max(std.Count, lux.Count); k++)
        {
            if (k < std.Count) result.Add(std[k]);
            if (k < lux.Count) result.Add(lux[k]);
        }
        return result;
    }
}
