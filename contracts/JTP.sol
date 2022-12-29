// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract JTP is ERC20, Ownable, Pausable {
    address private _FanToArtistStaking;

    //for the function callable only by FanToArtistStaking.sol
    modifier onlyStaking() {
        require(
            _FanToArtistStaking == _msgSender(),
            "onlyStaking: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    constructor(address _Staking) ERC20("JoinThePressure", "JTP") {
        _FanToArtistStaking = _Staking;
    }

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

    //Safe since it can be called only by FanToArtistStaking, could add a mapping(address => amount) to check if someone is unlocking more than what he previously locked
    function lock(address from, uint256 amount) external onlyStaking returns (bool) {
        _transfer(from, _msgSender(), amount);
        return true;
    }

    function unlock(address from, uint256 amount) external onlyStaking returns (bool) {
        return transfer(from, amount);
    }
}
