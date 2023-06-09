// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWeb3MusicNativeToken is IERC20 {
    function lock(address from, uint256 amount) external returns (bool);

    function pay(address to, uint256 amount) external;

    function mint(address to, uint256 amount) external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function transferOwnership(address to) external;

    function pause() external;

    function unpause() external;
}
