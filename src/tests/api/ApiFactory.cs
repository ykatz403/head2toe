using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Head2Toe.Api.Tests;

/// <summary>Boots the real API against a throwaway SQLite file, so every test class gets a clean database.</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    readonly string _db = Path.Combine(Path.GetTempPath(), $"h2t-test-{Guid.NewGuid():N}.db");
    readonly int _authLimit;

    public ApiFactory() : this(1000) { }
    protected ApiFactory(int authPerMinute) => _authLimit = authPerMinute;

    /// <summary>A separate instance with a tight auth limit, for testing the limiter itself.</summary>
    public sealed class Limited(int perMinute) : ApiFactory(perMinute);

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_db}");
        builder.UseSetting("RateLimit:AuthPerMinute", _authLimit.ToString());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _db, _db + "-wal", _db + "-shm" })
            try { File.Delete(f); } catch { /* best effort */ }
    }

    public HttpClient NoRedirectClient() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    public static string NewEmail() => $"user{Guid.NewGuid():N}@example.com";

    public record Auth(string Token, string Email);

    public async Task<(HttpClient Client, string Email)> SignedInClientAsync(string? email = null, string password = "password123")
    {
        email ??= NewEmail();
        var anon = CreateClient();
        var res = await anon.PostAsJsonAsync("/api/auth/register", new { email, password });
        res.EnsureSuccessStatusCode();
        var auth = (await res.Content.ReadFromJsonAsync<Auth>())!;
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return (client, email);
    }
}
