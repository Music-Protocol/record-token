// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

interface IJTP {
    function lock(address from, uint256 amount) external returns(bool);

    function unlock(address from, uint256 amount) external returns(bool);

    function mint(address to, uint256 amount) external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function transferOwnership(address to) external;

    function pause() external;

    function unpause() external;
}
