### vscode extension used
- [hardhat](https://marketplace.visualstudio.com/items?itemName=NomicFoundation.hardhat-solidity)
### installation
```
yarn install
```
### to compile and generate types necessary for testing
```
yarn compile
```
### to run all test on hardhat
```
yarn test 
```
### to see the coverage
```
yarn coverage 
```
### to run a single test on hardhat
```
yarn test ./test/<filename>.test.ts
```

### to deploy on ganache to be tested on Remix
- install [ganache](https://trufflesuite.com/ganache/)
- create [.env](./.env) copying from [.example.env](./.example.env)
    - insert the pk of an address and the url of ganache rpc server 
- run  
    ```
    yarn deploy:ganache
    ```

### audit
- install docker
  - since the [eth-security-toolbox](https://github.com/trailofbits/eth-security-toolbox/) container last update was made May 2022 I decided to build it directly from their [github repo](https://github.com/trailofbits/eth-security-toolbox), but since the parent image changed I had to update the Dockefile. Here are the commands to build it 
    ```
    git clone https://github.com/efebia-com/eth-security-toolbox.git
    cd eth-security-security
    docker build -t eth-security-toolbox .
    cd ..
    ```
- run 
    ```
    yarn toolbox
    ```
    - run slither
        ```
        slither /TP
        ```
        to exclude @openzeppelin contracts
        ```
        slither /TP --filter-paths "/TP/node_modules/@openzeppelin/"
        ```