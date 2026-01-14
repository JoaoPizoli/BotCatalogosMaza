interface ListRow {
    title: string;
    rowId: string;
    description?: string;
}
interface ListSection {
    title: string;
    rows: ListRow[];
}
interface ListMessage {
    text: string;
    footer?: string;
    title?: string;
    buttonText: string;
    sections: ListSection[];
}
//# sourceMappingURL=list.d.ts.map