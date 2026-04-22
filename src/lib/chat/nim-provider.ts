import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { withNimRequestNormalize } from './nim-request-normalize'

export function createNimChatModel(
  env: Cloudflare.Env,
  modelName: string,
  providerName = 'cf-ai-gateway-nim',
): LanguageModelV3 {
  const provider = createOpenAICompatible({
    name: providerName,
    baseURL: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/custom-nvidia-nim`,
    headers: { 'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}` },
    fetch: withNimRequestNormalize(),
  })
  return provider.chatModel(modelName)
}
