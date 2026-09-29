namespace Head2Toe.Api.Data;

/// <summary>
/// A small, hand-picked set of real products (real photos, prices and links), gathered by manually
/// browsing Everlane and Allbirds - not scraped, not automated. This stands in for a real affiliate
/// product feed until one is approved (Awin/Rakuten); swap this out once that's live. Note that Everlane
/// doesn't sell men's shoes, so shoes come from Allbirds instead.
/// </summary>
public static class RealProductSeed
{
    public static IEnumerable<Product> Catalog()
    {
        // ---- shirts (Everlane) ----
        yield return R("Pinwale Corduroy Shirt", "Everlane", 118.00m, "shirt",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-09-13_M-BTDN-FIC-SHRT-LS-CHOC_flat_700x.jpg?v=1788539811",
            "https://www.everlane.com/products/m-btdn-fic-shrt-ls-choc");
        yield return R("Classic Piqué Polo", "Everlane", 68.00m, "shirt",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/620cb988_25b7_700x.jpg?v=1781031614",
            "https://www.everlane.com/products/mens-classic-pique-polo-black");
        yield return R("Double-Gauze Button-Down Shirt", "Everlane", 168.00m, "shirt",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-09-06_M-BTDN-TDG-GZE-LS-KHKPLD_M1_127f8574-6fe3-410b-957d-59ad21f7e0a9_700x.jpg?v=1789793065",
            "https://www.everlane.com/products/m-btdn-tdg-gze-ls-khkpld");
        yield return R("Lightweight Denim Resort Shirt", "Everlane", 62.00m, "shirt",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-05-10_M-BTDN-TTW-RSRT-SS-DRK_M1_700x.jpg?v=1785441630",
            "https://www.everlane.com/products/mens-lightweight-denim-resort-shirt-medium-indigo");
        yield return R("Classic Piqué Polo (Heathered Graphite)", "Everlane", 68.00m, "shirt",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/ef4c2a39_f6af_700x.jpg?v=1768960815",
            "https://www.everlane.com/products/mens-classic-pique-polo-heathered-graphite");

        // ---- jackets (Everlane) ----
        yield return R("The Parka", "Everlane", 298m, "jacket",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/8b69a929_740e_700x.jpg?v=1753411725",
            "https://www.everlane.com/products/mens-parka-navy");
        yield return R("Soyeux Linen Blazer", "Everlane", 198m, "jacket",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/bc561057_78ec_700x.jpg?v=1781136005",
            "https://www.everlane.com/products/mens-soyeux-linen-linen-blazer-peyote");
        yield return R("Re:Cycled Nylon Parka", "Everlane", 348m, "jacket",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-09-20_M-OTWR-MLC-LSE-PRKA-BLK_flat_700x.jpg?v=1790185910",
            "https://www.everlane.com/products/m-otwr-mlc-lse-prka-blk");
        yield return R("Re:Cycled Nylon Mac Coat", "Everlane", 139m, "jacket",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/09950cae_b26e_700x.jpg?v=1770163207",
            "https://www.everlane.com/products/mens-recycled-nylon-mac-coat-trench-coat-khaki");
        yield return R("The Heavyweight Overshirt", "Everlane", 90m, "jacket",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/5f893110_3f12_700x.jpg?v=1753411669",
            "https://www.everlane.com/products/mens-heavyweight-overshirt-heather-earth-brown");

        // ---- pants (Everlane) ----
        yield return R("Everyday Relaxed-Fit Chino", "Everlane", 69m, "pants",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/8775e519_6ed8_700x.jpg?v=1770134407",
            "https://www.everlane.com/products/mens-everyday-relaxed-fit-chino-black");
        yield return R("Relaxed Pinwale Corduroy Trouser", "Everlane", 148m, "pants",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-09-20_M-BTM-FIC-RLX-TRSR-CHOC_M1_700x.jpg?v=1788457213",
            "https://www.everlane.com/products/m-btm-fic-rlx-trsr-choc");
        yield return R("The Easy Pant", "Everlane", 76m, "pants",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/25bd17fa_b69b_700x.jpg?v=1753411502",
            "https://www.everlane.com/products/mens-easy-pant-beech");
        yield return R("Everyday Straight-Fit Chino", "Everlane", 69m, "pants",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/8b2dcdf2_3cae_700x.jpg?v=1769983210",
            "https://www.everlane.com/products/mens-everyday-straight-fit-chino-deep-navy");
        yield return R("Stretch Corduroy 5-Pocket Pant", "Everlane", 128m, "pants",
            "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-09-13_M-BTM-FCO-5PKT-PNT-COCO_M1_700x.jpg?v=1788539904",
            "https://www.everlane.com/products/m-btm-fco-5pkt-pnt-coco");

        // ---- shoes (Allbirds - Everlane doesn't sell men's shoes) ----
        yield return R("Men's Cruiser (Medium Grey)", "Allbirds", 100m, "shoes",
            "https://www.allbirds.com/cdn/shop/files/A11559_25Q3_Cruiser_Dark_Navy_Blizzard_PDP_LEFT-2000x2000_9f5ba943-6b25-4f75-9c74-edd67a6a0aa7.png?v=1751900449&width=300",
            "https://www.allbirds.com/products/mens-cruiser-medium-grey");
        yield return R("Men's Dasher NZ (Anthracite)", "Allbirds", 140m, "shoes",
            "https://www.allbirds.com/cdn/shop/files/A12416_26Q1_Dasher-NZ-Anthracite-Dark-Anthr_PDP_LEFT.png?v=1768948005&width=1024",
            "https://www.allbirds.com/products/mens-dasher-nz-anthracite");
        yield return R("Men's Dasher NZ (Light Burnt Olive)", "Allbirds", 140m, "shoes",
            "https://www.allbirds.com/cdn/shop/files/A12519_26Q1_Dasher-NZ-Light-Burnt-Olive-Natural-White-Sole_PDP_LEFT.png?v=1768948277&width=1024",
            "https://www.allbirds.com/products/mens-dasher-nz-light-burnt-olive");
        yield return R("Men's Dasher NZ (Blizzard)", "Allbirds", 140m, "shoes",
            "https://www.allbirds.com/cdn/shop/files/A12447_26Q1_Dasher-NZ-Blizzard-Blizzard_PDP_LEFT.png?v=1768948090&width=1024",
            "https://www.allbirds.com/products/mens-dasher-nz-blizzard");
        yield return R("Men's Dasher NZ (Blizzard/Deep Navy)", "Allbirds", 140m, "shoes",
            "https://www.allbirds.com/cdn/shop/files/A12464_26Q1_Dasher-NZ-Blizzard-Deep-Navy-Blizzard_PDP_LEFT.png?v=1768948183&width=1024",
            "https://www.allbirds.com/products/mens-dasher-nz");
    }

    static Product R(string name, string brand, decimal price, string category, string imageUrl, string productUrl) => new()
    {
        Name = name, Brand = brand, Price = price, Season = "all", Slot = category, Tier = "everyday",
        Color = "#888888", Url = productUrl, AttrsJson = System.Text.Json.JsonSerializer.Serialize(new { realImage = imageUrl }),
    };
}
