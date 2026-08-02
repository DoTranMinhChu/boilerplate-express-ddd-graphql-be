import * as crypto from 'crypto';
export class StringUtil {

    static BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

    static toBase62(bigint: bigint): string {
        let result = '';
        while (bigint > 0) {
            result = StringUtil.BASE62_ALPHABET[Number(bigint % 62n)] + result;
            bigint = bigint / 62n;
        }
        return result || '0';
    }
    static hashBase62(input: string): string {
        const hashHex = crypto.createHash('sha256').update(input).digest('hex'); // SHA-256 → Hex
        const hashBigInt = BigInt('0x' + hashHex); // Chuyển thành BigInt


        return StringUtil.toBase62(hashBigInt).substring(0, 22); // Mã hóa Base62 và cắt ngắn
    }


    static joinUrl(baseUrl: string, path: string): string {
        return new URL(path, baseUrl).toString();
    }

    static shortCodeToUuid(code: string): string {
        const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

        let num = 0n;

        for (const char of code) {
            num = num * 62n + BigInt(BASE62.indexOf(char));
        }

        // convert BigInt -> hex
        let hex = num.toString(16).padStart(32, "0");

        // format UUID
        return [
            hex.substring(0, 8),
            hex.substring(8, 12),
            hex.substring(12, 16),
            hex.substring(16, 20),
            hex.substring(20),
        ].join("-");
    }

}