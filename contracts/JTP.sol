// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract JTP is ERC20, Ownable, Pausable {
    constructor() ERC20("JoinThePressure", "JTP") {}

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external onlyOwner {
        _burn(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) external onlyOwner {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }
}
