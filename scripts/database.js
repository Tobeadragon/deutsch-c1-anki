const DB = {
    key: 'C1_ANKI_DB_PRO',
    async fetchAll() {
        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : [];
    },
    async save(items) {
        localStorage.setItem(this.key, JSON.stringify(items));
        return true;
    }
};