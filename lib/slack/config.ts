/**
 * Lo de la app de Slack que se puede usar en el navegador (sin nada del servidor): los permisos del bot
 * y el manifiesto para crear la app en api.slack.com/apps → Create New App → From a manifest.
 *
 * Lo que puede hacer el bot:
 *  chat:write / chat:write.public → escribir (también en canales públicos donde no está)
 *  users:read / users:read.email  → la gente del Slack con su mail, para cruzarla con el equipo
 *  im:write / mpim:write          → abrir un privado con alguien o con un grupo
 *  channels:read / channels:join / channels:manage → ver, sumarse, crear canales e invitar gente
 *  team:read                      → el dominio del Slack, para los links
 */
export const SLACK_SCOPES = [
  "chat:write",
  "chat:write.public",
  "users:read",
  "users:read.email",
  "im:write",
  "mpim:write",
  "channels:read",
  "channels:join",
  "channels:manage",
  "team:read",
];

/** El manifiesto de la app de Slack, con la vuelta de OAuth de esta app (origen: https://…). */
export function manifiestoSlack(origen: string) {
  return {
    display_information: {
      name: "Herramientas",
      description: "Los avisos del estudio: cumpleaños, menciones, resúmenes y lo de cada marca.",
      background_color: "#111111",
    },
    features: {
      bot_user: { display_name: "Herramientas", always_online: true },
      app_home: { home_tab_enabled: false, messages_tab_enabled: true, messages_tab_read_only_enabled: true },
    },
    oauth_config: {
      redirect_urls: [`${origen}/api/auth/slack/callback`],
      scopes: { bot: SLACK_SCOPES },
    },
    settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
  };
}
