export const listaOpcDados: PollContent = {
    poll: {
        name: "Escolha uma opção:",
        values: [
            "Pedidos do Dia",
            "Comparativo do Dia", 
            "Geral"
        ],
        selectableCount: 1
    }
}

export const menuCompleto: PollContent = {
    poll: {
        name: "Menu Principal - Selecione uma opção:",
        values: [
            "🎨-Embalagens",
            "📑-Catálogos Digitais", 
            "🎬-Videos"
        ],
        selectableCount: 1
    }
}

export const preferenciasUsuario: PollContent = {
    poll: {
        name: "Quais relatórios você quer receber?",
        values: [
            "Vendas Diárias",
            "Estoque Baixo",
            "Novos Clientes",
            "Performance"
        ],
        selectableCount: 3 
    }
}