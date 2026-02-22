import type { RpcCaller } from './types'

export async function getUsageStatus(call: RpcCaller): Promise<any> {
    return call('usage.status')
}
export async function getUsageCost(call: RpcCaller): Promise<any> {
    return call('usage.cost')
}

export async function getTtsStatus(call: RpcCaller): Promise<any> {
    return call('tts.status')
}
export async function getTtsProviders(call: RpcCaller): Promise<any> {
    return call('tts.providers')
}
export async function setTtsEnable(call: RpcCaller, enable: boolean): Promise<any> {
    return call(enable ? 'tts.enable' : 'tts.disable')
}
export async function setTtsProvider(call: RpcCaller, provider: string): Promise<any> {
    return call('tts.setProvider', { provider })
}

export async function getVoicewake(call: RpcCaller): Promise<any> {
    return call('voicewake.get')
}
export async function setVoicewake(call: RpcCaller, params: any): Promise<any> {
    return call('voicewake.set', params)
}
