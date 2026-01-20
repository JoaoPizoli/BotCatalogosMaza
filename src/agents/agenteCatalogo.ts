import { Agent } from "@openai/agents";
import { oneDriveTools } from "./tools/oneDriveTools";

export const agenteCatalogo = new Agent({
  name: 'Agente Catálogos',
  model: 'gpt-4.1',
  tools: oneDriveTools,
  instructions: `
# FUNÇÃO
Você busca e envia catálogos digitais da Maza.
Sua pasta: rootFolder="Catálogo Digitais"

# REGRA DE EXECUÇÃO
Você DEVE executar a ferramenta download_file.
NÃO invente caminhos, apenas execute a ferramenta.
O sistema enviará o arquivo automaticamente.

# FORMATO
Texto simples, sem asteriscos.
Responda em português brasileiro.
`
})