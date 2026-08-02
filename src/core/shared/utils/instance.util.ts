import os from 'os';

// URL của chính instance này — được set một lần khi server bind xong port.
// Dùng để trả về cho FE biết gọi endpoint job tracking vào đâu.
let _instanceUrl = '';

export function setInstanceUrl(url: string): void {
    _instanceUrl = url;
}

export function getInstanceUrl(): string {
    return _instanceUrl;
}

// Lấy địa chỉ IPv4 non-loopback đầu tiên của máy.
// Docker / VM: trả về IP của container/VM (vd: 172.17.0.3).
// Bare-metal nhiều NIC: trả về IP của card mạng đầu tiên.
export function detectLocalIP(): string {
    const nets = os.networkInterfaces();
    for (const iface of Object.values(nets)) {
        for (const addr of iface ?? []) {
            if (addr.family === 'IPv4' && !addr.internal) {
                return addr.address;
            }
        }
    }
    return '127.0.0.1';
}
