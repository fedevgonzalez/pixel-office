import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { getServerConfig } from '../serverConfig.js'
import type { ServerConfig } from '../serverConfig.js'

const defaultConfig: ServerConfig = { featureFlag: false }

const ServerConfigContext = createContext<ServerConfig>(defaultConfig)

export function ServerConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ServerConfig>(defaultConfig)

  useEffect(() => {
    getServerConfig().then(setConfig)
  }, [])

  return (
    <ServerConfigContext.Provider value={config}>
      {children}
    </ServerConfigContext.Provider>
  )
}

export function useServerConfig(): ServerConfig {
  return useContext(ServerConfigContext)
}
