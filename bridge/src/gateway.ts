interface GatewayToolInvokeConfig {
  gatewayHttpUrl: string
  gatewayCredential: string
}

export async function gatewayToolCall<T = unknown>(
  config: GatewayToolInvokeConfig,
  tool: string,
  args: Record<string, unknown>,
  sessionKey = 'main'
): Promise<T> {
  if (!config.gatewayCredential) {
    throw new Error('Gateway credential missing. Set PRSM_GATEWAY_TOKEN or PRSM_GATEWAY_PASSWORD.')
  }

  const response = await fetch(`${config.gatewayHttpUrl.replace(/\/$/, '')}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.gatewayCredential}`
    },
    body: JSON.stringify({
      tool,
      args,
      sessionKey
    })
  })

  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.ok) {
    const message = payload?.error?.message || payload?.error || `Gateway tool call failed (${response.status})`
    throw new Error(String(message))
  }

  return payload.result as T
}
