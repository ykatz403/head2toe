using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Head2Toe.Api.Services;

public record TryOnRequest(string HumanImage, string GarmentImage, string GarmentDescription, string Category);

/// <summary>Either the generated image's URL, or a message safe to show the user.</summary>
public record TryOnResult(string? ImageUrl, string? Error);

/// <summary>
/// Puts a real garment photo onto a real photo of a person using FASHN's Try-On Max: their high-fidelity
/// tier (up to 4K, "enhanced fidelity"), built for publishable fashion photography rather than fast
/// interactive previews. This is what we need after both a manually-masked open-source model and a
/// general instruction editor failed to hold identity steady on real photos, and the faster tryon-v1.6
/// endpoint softened fine patterns like checks and gingham.
/// This is the one place the person's photo leaves the device - only to reach FASHN's inference API,
/// never stored by this app.
/// </summary>
public class FashnTryOn
{
    static readonly string[] ValidCategories = ["upper_body", "lower_body", "dresses"]; // Max auto-detects the garment type; this is just input validation

    readonly HttpClient _http;
    readonly ILogger<FashnTryOn> _log;

    public FashnTryOn(HttpClient http, IConfiguration config, ILogger<FashnTryOn> log)
    {
        _http = http;
        _log = log;
        _http.BaseAddress = new Uri("https://api.fashn.ai/v1/");
        var token = config["Fashn:ApiToken"];
        if (!string.IsNullOrWhiteSpace(token))
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public bool Configured => _http.DefaultRequestHeaders.Authorization is not null;

    public async Task<TryOnResult> GenerateAsync(TryOnRequest req, CancellationToken ct)
    {
        if (!Configured) return new TryOnResult(null, "Try-on isn't configured yet. Set FASHN_API_TOKEN.");
        if (!ValidCategories.Contains(req.Category)) return new TryOnResult(null, "Category must be upper_body, lower_body or dresses.");

        var body = new
        {
            model_name = "tryon-max",
            inputs = new
            {
                model_image = req.HumanImage,
                product_image = req.GarmentImage,
                resolution = "2k",
                generation_mode = "quality",
                output_format = "jpeg",
            },
        };

        RunResponse run;
        try
        {
            var res = await _http.PostAsJsonAsync("run", body, ct);
            if (!res.IsSuccessStatusCode) return await MapApiError(res, ct);
            run = await res.Content.ReadFromJsonAsync<RunResponse>(cancellationToken: ct)
                ?? throw new InvalidOperationException("FASHN returned an empty response.");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _log.LogWarning(ex, "Could not reach FASHN");
            return new TryOnResult(null, "Could not reach the try-on service. Check your connection and try again.");
        }
        if (run.Error is not null) return new TryOnResult(null, run.Error);

        var deadline = DateTime.UtcNow.AddSeconds(60);
        StatusResponse status;
        do
        {
            await Task.Delay(1500, ct);
            var poll = await _http.GetAsync($"status/{run.Id}", ct);
            if (!poll.IsSuccessStatusCode) return await MapApiError(poll, ct);
            status = await poll.Content.ReadFromJsonAsync<StatusResponse>(cancellationToken: ct) ?? throw new InvalidOperationException("FASHN returned an empty status.");
        } while (status.Status is "starting" or "in_queue" or "processing" && DateTime.UtcNow < deadline);

        return status.Status switch
        {
            "completed" when status.Output is { Length: > 0 } => new TryOnResult(status.Output[0], null),
            "completed" => new TryOnResult(null, "The try-on service returned no image."),
            "failed" => new TryOnResult(null, FriendlyRuntimeError(status.Error)),
            _ => new TryOnResult(null, "The try-on is taking longer than expected. Try again in a moment."),
        };
    }

    static string FriendlyRuntimeError(RuntimeError? error) => error?.Name switch
    {
        "ImageLoadError" => "One of those photos couldn't be read. Try a different one.",
        "ContentModerationError" => "That photo pair was blocked by content moderation. Try different photos.",
        "InputValidationError" => "Those inputs weren't valid. Try a different photo.",
        _ => "That photo pair couldn't be composited. Try a plainer background or a clearer garment photo.",
    };

    async Task<TryOnResult> MapApiError(HttpResponseMessage res, CancellationToken ct)
    {
        var text = await res.Content.ReadAsStringAsync(ct);
        _log.LogWarning("FASHN rejected the request: {Status} {Body}", res.StatusCode, text);
        return new TryOnResult(null, res.StatusCode switch
        {
            System.Net.HttpStatusCode.Unauthorized => "The try-on service rejected our API token.",
            System.Net.HttpStatusCode.PaymentRequired => "The try-on account has run out of credit.",
            System.Net.HttpStatusCode.TooManyRequests => "The try-on service is busy. Wait a moment and try again.",
            _ => "The try-on service could not process that. Try a different photo.",
        });
    }

    record RunResponse(string Id, string? Error);
    record RuntimeError(string Name, string Message);
    record StatusResponse(string Id, string Status, string[]? Output, RuntimeError? Error);
}
