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