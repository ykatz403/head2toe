using Head2Toe.Api.Data;
using Head2Toe.Api.Services;

namespace Head2Toe.Api.Tests;

/// <summary>Pure unit tests of the outfit engine, with a tiny hand-made catalog so expected picks are obvious.</summary>
public class OutfitEngineTests
{
    static Product P(int id, string slot, string tier, decimal price = 10, string season = "summer") => new()
    {
        Id = id, Season = season, Slot = slot, Tier = tier, Brand = "B", Name = $"{slot}-{id}", Price = price, Color = "#000000", Url = "https://x.test", AttrsJson = "{}",
    };

    [Fact]
    public void Empty_catalog_gives_a_note_for_every_slot_and_a_zero_total()
    {
        var o = OutfitEngine.Build([], "summer", "both", 0);
        Assert.Equal(9, o.Items.Count);
        Assert.All(o.Items, i => { Assert.Null(i.Product); Assert.NotNull(i.Note); });
        Assert.Equal(0, o.Total);
    }

    [Fact]
    public void Picks_by_seed_and_wraps_around_the_pool()
    {
        var pool = new List<Product> { P(1, "shoes", "std"), P(2, "shoes", "std"), P(3, "shoes", "std") };
        int PickAt(int seed) => OutfitEngine.Build(pool, "summer", "std", seed).Items.Single(i => i.Slot == "shoes").Product!.Id;
        // shoes is slot index 8, so the pick is (seed + 8) % 3
        Assert.Equal(3, PickAt(0)); Assert.Equal(1, PickAt(1)); Assert.Equal(2, PickAt(2)); Assert.Equal(3, PickAt(3));
    }

    [Fact]
    public void Negative_seeds_wrap_instead_of_throwing()
    {
        var pool = new List<Product> { P(1, "hat", "std"), P(2, "hat", "std") };
        var o = OutfitEngine.Build(pool, "summer", "std", -7);
        Assert.NotNull(o.Items.Single(i => i.Slot == "hat").Product);
    }

    [Fact]
    public void Both_interleaves_everyday_then_designer()
    {
        var pool = new List<Product> { P(1, "hat", "lux"), P(2, "hat", "lux"), P(3, "hat", "std"), P(4, "hat", "std") };
        // hat is slot index 0, so seed 0..3 walks the interleaved order std,lux,std,lux
        var ids = Enumerable.Range(0, 4).Select(s => OutfitEngine.Build(pool, "summer", "both", s).Items[0].Product!.Tier).ToList();
        Assert.Equal(["std", "lux", "std", "lux"], ids);
    }

    [Fact]
    public void Uneven_tiers_still_interleave_without_losing_pieces()
    {
        var pool = new List<Product> { P(1, "hat", "std"), P(2, "hat", "lux"), P(3, "hat", "lux"), P(4, "hat", "lux") };
        var seen = Enumerable.Range(0, 4).Select(s => OutfitEngine.Build(pool, "summer", "both", s).Items[0].Product!.Id).ToHashSet();
        Assert.Equal(4, seen.Count);
    }

    [Fact]
    public void A_tier_with_no_pieces_for_a_slot_falls_back_to_a_note()
    {
        var pool = new List<Product> { P(1, "hat", "std") };
        var hat = OutfitEngine.Build(pool, "summer", "lux", 0).Items[0];
        Assert.Null(hat.Product);
        Assert.False(string.IsNullOrEmpty(hat.Note));
    }

    [Fact]
    public void Other_seasons_are_ignored()
    {
        var pool = new List<Product> { P(1, "hat", "std", season: "winter") };
        Assert.Null(OutfitEngine.Build(pool, "summer", "std", 0).Items[0].Product);
    }

    [Fact]
    public void Total_adds_up_the_chosen_pieces_only()
    {
        var pool = new List<Product> { P(1, "hat", "std", 5.5m), P(2, "top", "std", 20m), P(3, "top", "std", 999m) };
        var o = OutfitEngine.Build(pool, "summer", "std", 0);
        Assert.Equal(o.Items.Sum(i => i.Product?.Price ?? 0), o.Total);
        Assert.Contains(o.Total, new[] { 5.5m + 20m, 5.5m + 999m }); // exactly one top is counted, never both
    }

    [Fact]
    public void Attrs_round_trip_into_the_dto()
    {
        var p = P(1, "hat", "std"); p.AttrsJson = "{\"shape\":\"straw\"}";
        var dto = OutfitEngine.ToDto(p);
        Assert.Equal("straw", dto.Attrs["shape"].GetString());
        Assert.Equal("/go/1", dto.ShopUrl);
    }
}
