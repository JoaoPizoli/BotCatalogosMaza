import type { WAMessage } from '@whiskeysockets/baileys';
export declare function isAudioMessage(msg: WAMessage): boolean;
export declare function downloadAudio(msg: WAMessage): Promise<string | null>;
export declare function transcribeAudio(audioPath: string): Promise<string | null>;
export declare function processAudioMessage(msg: WAMessage): Promise<string | null>;
//# sourceMappingURL=audioTranscription.d.ts.map