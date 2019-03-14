include Configfile

SHELL := /bin/bash


login-ibmcloud:
	ibmcloud login -a https://api.us-east.bluemix.net --apikey $(IBMCLOUD_APIKEY)
	ibmcloud cr login

prereqs-ibmcloud:
	curl -sL https://ibm.biz/idt-installer | bash

lint:
	npm run lint

prune:
	npm prune --production

stellar-quickstart:
	docker pull stellar/quickstart
	docker run --rm -d -p "127.0.0.1:8000:8000" --name stellar stellar/quickstart --standalone

build-app:
	npm run build:production

docker-image:
	docker build -t $(IMAGE):latest .

push-image:
	docker tag $(IMAGE):latest $(IMAGE_REPO)/$(IMAGE):latest
	docker tag $(IMAGE):latest $(IMAGE_REPO)/$(IMAGE):1.0.0-$(IMAGE_TAG)
	echo "push image to $(IMAGE_REPO)"
	docker push $(IMAGE_REPO)/$(IMAGE):1.0.0-$(IMAGE_TAG)
	docker push $(IMAGE_REPO)/$(IMAGE):latest
	echo "Verify pull image from $(IMAGE_REPO)"
	docker pull $(IMAGE_REPO)/$(IMAGE):1.0.0-$(IMAGE_TAG)

create-gh-pages:
	npm install forever -g
	npm install -g @2fd/graphdoc  ## used to generate Github pages
	npm run start:development-bg
	sleep 5
	graphdoc -e http://127.0.0.1:4001/account -o ./doc/schema --force

clean:
	npm run stop:development-bg

.PHONY: login image push-image test
