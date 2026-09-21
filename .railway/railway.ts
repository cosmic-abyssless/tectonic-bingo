import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

// Railway infrastructure for THIS repo's service only. The Railway project ("Tectonic") also runs other services from
// other repositories (bot, API, Postgres, sync, website); they are deliberately not described here.
//
// `partial` is what keeps it that way: it names this file's slice of the project, so Railway leaves everything not
// listed below alone. Without it (or with a different name) `railway config apply` treats this file as the WHOLE project
// and would delete every other service. Never remove it, and always read `railway config plan` before applying.
// See README.md in this folder.
export const partial = "bingo-website";

export default defineRailway(() => {
  const BingoData = volume("Bingo data", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-east4-eqdc4a",
    sizeMB: 5000,
  });

  const BingoWebsite = service("Bingo Website", {
    // Where production is built from today. (To deploy from cosmic-abyssless/tectonic-bingo instead, see README.md.)
    source: github("Miconen/tectonic-bingo", { branch: "production", checkSuites: false }),
    // Migrations run on every start, before the server, so a deploy always brings the database up to date.
    start: "npm run db:migrate --workspace=server && npm run start --workspace=server",
    healthcheck: "/health",
    replicas: { "us-east4-eqdc4a": 1 },
    domains: ["tectonic.cc", "www.tectonic.cc"],
    networking: { privateNetworkEndpoint: "vigilant-gentleness" },
    // SQLite and uploads live on this volume, which is why there can only be one replica (see issue #75).
    volumeMounts: { "/data": BingoData },
    // preserve() keeps whatever is already set in Railway, so those entries only document which variables the service
    // uses; secrets are set in the Railway dashboard, never here. The two Sentry DSNs are the exception: a DSN is not a
    // secret (it is compiled into the client for anyone to read), so they are set from code.
    env: {
      // Error monitoring (Sentry, org tectonic-l9). The server reads its own project's DSN when it starts; the client's is
      // baked into the browser bundle when Railway builds it, so it has to be set here before the build.
      SENTRY_DSN: "https://3b7db6f6e1855ee5751af4ef3b5bf8f1@o4512121532973056.ingest.us.sentry.io/4512121567379456",
      VITE_SENTRY_DSN: "https://f6af116b972e4041efc5e85e720306e6@o4512121532973056.ingest.us.sentry.io/4512121567510528",
      ADMIN_DISCORD_IDS: preserve(),
      CLIENT_URL: preserve(),
      DB_PATH: preserve(),
      DEV_LOGIN_ENABLED: preserve(),
      DISCORD_CALLBACK_URL: preserve(),
      DISCORD_CLIENT_ID: preserve(),
      DISCORD_CLIENT_SECRET: preserve(),
      DISCORD_GUILD_ID: preserve(),
      NODE_ENV: preserve(),
      RUNEPROFILE_API_KEY: preserve(),
      SESSION_SECRET: preserve(),
      TECTONIC_API_KEY: preserve(),
      TECTONIC_API_URL: preserve(),
      TECTONIC_GUILD_ID: preserve(),
      UPLOADS_DIR: preserve(),
      USER_AGENT_CONTACT: preserve(),
      WOM_API_KEY: preserve(),
    },
  });

  return project("Tectonic", { resources: [BingoWebsite, BingoData] });
});
