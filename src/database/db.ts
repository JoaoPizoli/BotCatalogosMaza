import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database | undefined;

export async function setupDatabase(){
    db = await open({
        filename: ':memory:',
        driver: sqlite3.Database
    })
    await db.exec(`
            CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            message_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            );

            CREATE TABLE usuarios (
                telefone TEXT PRIMARY KEY,
                status TEXT DEFAULT 'INATIVO',
                openai_thread_id TEXT
            );
        `)
    console.log("Banco iniciado!");
}


export async function salvarEnquete(msgId: string, messageJson: any){
    if(!db) return

    const jsonString = JSON.stringify(messageJson);

    await db.run('INSERT INTO polls (id, message_json) VALUES (?,?)', msgId, jsonString)
}



export async function buscarEnquete(msgId: string){
    if(!db) return null;

    const result = await db.get('SELECT message_json FROM polls WHERE id = ?', msgId)

    if(result){
        return JSON.parse(result.message_json)
    }
    return null
}

export async function criarUsuario(jsId: string){
    if(!db) return null;
    const result = await db.run('INSERT INTO usuarios (telefone) VALUES (?)', jsId)
    if(!result){
        return console.error('Erro ao criar Usuario Temporário!')
    }
}

export async function getEstadoUsuario(jsId: string){
    if(!db) return null;
    const result = await db.get('SELECT status FROM usuarios WHERE telefone = ?', jsId)
    if(result){
        return JSON.parse(result.status)
    }
}

export async function updateUsuario(jsId: string, estado: string){
    if(!db) return null;
    if(estado === 'INATIVO'){
        const result = await db.run('UPDATE usuarios SET status = "AGUARDANDO_PRIMEIRO_VOTO" WHERE telefone = ?', jsId)
        if(result){
            return console.log(result)
        }
    } else if (estado === 'AGUARDANDO_PRIMEIRO_VOTO'){
        const result = await db.run('UPDATE usuarios SET status = "AGUARDANDO_SEGUNDO_VOTO" WHERE telefone = ?', jsId) 
        if(result){
            console.log(result)
        }
    } else if(estado === 'AGUARDANDO_SEGUNDO_VOTO'){
        const result = await db.run('UPDATE usuarios SET status = "EM_ATENDIMENTO" WHERE telefone = ?', jsId) 
        if(result){
            console.log(result)
        }
    } else if(estado === 'EM_ATENDIMENTO'){
        const result = await db.run('UPDATE usuarios SET status = "INATIVO" WHERE telefone = ?', jsId) 
        if(result){
            console.log(result)
        }
    }
}