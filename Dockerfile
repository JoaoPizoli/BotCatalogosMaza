FROM node:22.19

WORKDIR /app

COPY package*.json ./

RUN npm install 

COPY . .

EXPOSE 5001

CMD ["npm","start"]