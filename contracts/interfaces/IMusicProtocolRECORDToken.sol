// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMusicProtocolRECORDToken is IERC20 {
    function lock(address from, uint256 amount) external returns (bool);

    function pay(address to, uint256 amount) external;

    function mint(address to, uint256 amount) external;

    function mint_and_lock(address _beneficiary, uint256 _amount, uint64 _start, uint64 _duration) external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function transfer_and_lock(address _from, address _beneficiary, uint256 _amount, uint64 _start, uint64 _duration) external;

    function transferOwnership(address to) external;

    function pause() external;

    function unpause() external;
}
