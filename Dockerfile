FROM eth-security-toolbox
COPY . /TP
WORKDIR /TP
RUN sudo rm ./node_modules -rfd
RUN sudo yarn install
RUN sudo chmod ugo+rwx /TP -R