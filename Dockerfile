FROM node:11-alpine

# Create app directory
WORKDIR /usr/src/app

RUN apk update && apk upgrade \
	&& apk add --no-cache git \
	&& apk --no-cache add --virtual builds-deps build-base python \
	&& npm install -g nodemon cross-env eslint npm-run-all node-gyp node-pre-gyp && npm install\
	&& npm rebuild bcrypt --build-from-source


# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY ./build .

EXPOSE 4001
ENV NODE_ENV production
CMD [ "npm", "run", "start:production" ]
