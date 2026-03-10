export interface ServerConfig {
  featureFlag: boolean
}

const defaultConfig: ServerConfig = { featureFlag: false }

let configPromise: Promise<ServerConfig> | null = null

function fetchConfig(): Promise<ServerConfig> {
  return fetch('/api/config')
    .then((r) => (r.ok ? r.json() as Promise<ServerConfig> : defaultConfig))
    .catch(() => defaultConfig)
}

export function getServerConfig(): Promise<ServerConfig> {
  if (!configPromise) configPromise = fetchConfig()
  return configPromise
}
