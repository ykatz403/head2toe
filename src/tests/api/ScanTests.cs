using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Head2Toe.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Head2Toe.Api.Tests;

public class ScanTests(ApiFactory f) : IClassFixture<ApiFactory>
{
    record Scan(int HeightCm, int BuildPct, int SkinTone, DateTime CreatedAt);
    static object Body(int h = 176, int b = 104, int s = 2) => new { heightCm = h, buildPct = b, skinTone = s };

    [Fact]
    public async Task Scan_requires_sign_in()
    {
        var c = f.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/scan")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PutAsJsonAsync("/api/scan", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.DeleteAsync("/api/scan")).StatusCode);
    }

    [Fact]
    public async Task A_new_user_has_no_scan()
    {
        var (c, _) = await f.SignedInClientAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await c.GetAsync("/api/scan")).StatusCode);
    }

    [Fact]
    public async Task Saved_scan_can_be_read_back()
    {
        var (c, _) = await f.SignedInClientAsync();
        var put = await c.PutAsJsonAsync("/api/scan", Body(181, 110, 3));
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var got = (await (await c.GetAsync("/api/scan")).Content.ReadFromJsonAsync<Scan>())!;
        Assert.Equal((181, 110, 3), (got.HeightCm, got.BuildPct, got.SkinTone));
        Assert.True((DateTime.UtcNow - got.CreatedAt).TotalMinutes < 1);
    }

    [Fact]
    public async Task Saving_again_replaces_the_scan_instead_of_adding_another()
    {
        var (c, email) = await f.SignedInClientAsync();
        await c.PutAsJsonAsync("/api/scan", Body(170, 95, 0));
        await c.PutAsJsonAsync("/api/scan", Body(175, 100, 1));
        var got = (await (await c.GetAsync("/api/scan")).Content.ReadFromJsonAsync<Scan>())!;
        Assert.Equal(175, got.HeightCm);
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var uid = (await db.Users.SingleAsync(u => u.Email == email)).Id;
        Assert.Equal(1, await db.Scans.CountAsync(s => s.UserId == uid));
    }

    [Theory]
    [InlineData(119, 100, 0)] [InlineData(221, 100, 0)] [InlineData(0, 100, 0)] [InlineData(-5, 100, 0)]
    [InlineData(176, 84, 0)] [InlineData(176, 126, 0)]
    [InlineData(176, 100, -1)] [InlineData(176, 100, 5)]
    public async Task Out_of_range_values_are_rejected_and_nothing_is_saved(int h, int b, int s)
    {
        var (c, _) = await f.SignedInClientAsync();
        var res = await c.PutAsJsonAsync("/api/scan", Body(h, b, s));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.GetAsync("/api/scan")).StatusCode);
    }

    [Theory]
    [InlineData(120, 85, 0)] [InlineData(220, 125, 4)]
    public async Task Boundary_values_are_accepted(int h, int b, int s)
    {
        var (c, _) = await f.SignedInClientAsync();
        Assert.Equal(HttpStatusCode.OK, (await c.PutAsJsonAsync("/api/scan", Body(h, b, s))).StatusCode);
    }

    [Fact]
    public async Task Delete_removes_the_scan_and_is_safe_to_repeat()
    {
        var (c, _) = await f.SignedInClientAsync();
        await c.PutAsJsonAsync("/api/scan", Body());
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync("/api/scan")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.GetAsync("/api/scan")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync("/api/scan")).StatusCode);
    }

    [Fact]
    public async Task Users_cannot_see_or_delete_each_others_scans()
    {
        var (a, _) = await f.SignedInClientAsync();
        var (b, _) = await f.SignedInClientAsync();
        await a.PutAsJsonAsync("/api/scan", Body(190, 120, 4));
        Assert.Equal(HttpStatusCode.NoContent, (await b.GetAsync("/api/scan")).StatusCode);
        await b.DeleteAsync("/api/scan");
        var still = (await (await a.GetAsync("/api/scan")).Content.ReadFromJsonAsync<Scan>())!;
        Assert.Equal(190, still.HeightCm);
    }

    [Fact]
    public async Task A_tampered_token_is_rejected()
    {
        var (c, _) = await f.SignedInClientAsync();
        var token = c.DefaultRequestHeaders.Authorization!.Parameter!;
        var tampered = token[..^4] + (token.EndsWith("AAAA") ? "BBBB" : "AAAA");
        var bad = f.CreateClient();
        bad.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tampered);
        Assert.Equal(HttpStatusCode.Unauthorized, (await bad.GetAsync("/api/scan")).StatusCode);
    }

    [Fact]
    public async Task Garbage_token_is_rejected()
    {
        var bad = f.CreateClient();
        bad.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not.a.jwt");
        Assert.Equal(HttpStatusCode.Unauthorized, (await bad.GetAsync("/api/scan")).StatusCode);
    }
}
