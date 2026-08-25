import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('Cole as linhas abaixo no arquivo .env da raiz do repositÃ³rio.');
console.log('A chave privada deve ficar somente nesse arquivo e no ambiente do backend.');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:suporte@seudominio.com');
