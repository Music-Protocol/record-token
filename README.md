### vscode extension used
- [hardhat](https://marketplace.visualstudio.com/items?itemName=NomicFoundation.hardhat-solidity)
### installation
```
yarn install
```
### to compile
```
yarn compile
```
### to run test on hardhat
```
yarn test 
```

### deploy on ganache to be tested on Remix
- install [ganache](https://trufflesuite.com/ganache/)
- create [.env](./.env) copying from [.example.env](./.example.env)
    - insert the pk of an address and the url of ganache rpc server 
- run  
    ```
    npx hardhat run ./scripts/deploy.js --network localganache
    ``` 
    or
    ```
    yarn deploy:ganache
    ``` 
