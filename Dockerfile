# 1. Escolher a imagem oficial do Node.js (versão LTS)
FROM node:18-alpine

# 2. Definir o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# 3. Copiar package.json e package-lock.json primeiro (para aproveitar cache)
COPY package*.json ./

# 4. Instalar dependências (nó + módulos)
RUN npm install --production

# 5. Copiar todo o restante do código para dentro do container
COPY . .

# 6. Se o seu código já usar variáveis de ambiente (via process.env), não há necessidade de expor portas.
#    Caso precise expor, por exemplo, uma porta HTTP, use EXPOSE <porta>.
#    Aqui você não expõe nada: o container só vai ser cliente MQTT e Tuya.

# 7. Comando padrão para rodar o script principal
#    Se quiser rodar control.js assim que o container subir:
CMD ["node", "controlYeelight.js"]
