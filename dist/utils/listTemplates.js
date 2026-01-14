"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferenciasUsuario = exports.menuCompleto = exports.listaOpcDados = void 0;
exports.listaOpcDados = {
    poll: {
        name: "Escolha uma opção:",
        values: [
            "Pedidos do Dia",
            "Comparativo do Dia",
            "Geral"
        ],
        selectableCount: 1
    }
};
exports.menuCompleto = {
    poll: {
        name: "Menu Principal - Selecione uma opção:",
        values: [
            "📊 Relatórios",
            "📈 Dashboard",
            "⚙️ Configurações",
            "❓ Ajuda",
            "📞 Suporte"
        ],
        selectableCount: 1
    }
};
exports.preferenciasUsuario = {
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
};
//# sourceMappingURL=listTemplates.js.map