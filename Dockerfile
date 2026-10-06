# Builds the React app into the API's wwwroot, then publishes the API as a single
# self-contained image - one process serves both the UI and the API, same as locally.

FROM node:24-slim AS web
WORKDIR /src/web
COPY src/web/package.json src/web/package-lock.json ./
COPY src/web/scripts ./scripts
RUN npm ci
COPY src/web ./
RUN mkdir -p ../api/wwwroot && npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src/api
COPY src/api/Head2Toe.Api.csproj ./
RUN dotnet restore
COPY src/api ./
COPY --from=web /src/api/wwwroot ./wwwroot
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "Head2Toe.Api.dll"]
