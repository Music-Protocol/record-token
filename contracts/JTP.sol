// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IJTP.sol";

contract JTP is IJTP, ERC20, Ownable, Pausable {
    address private immutable _fanToArtistStaking;
    address private immutable _dexlFactory;

    //for the function callable only by FanToArtistStaking.sol
    modifier onlyStaking() {
        require(
            _fanToArtistStaking == _msgSender(),
            "JTP: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    modifier onlyTP() {
        require(
            _fanToArtistStaking == _msgSender() || _dexlFactory == _msgSender(),
            "JTP: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    constructor(
        address staking_,
        address dexlFactory_
    ) ERC20("JoinThePressure", "JTP") {
        require(
            staking_ != address(0),
            "JTP: the address of FanToArtistStaking is 0"
        );
        require(
            dexlFactory_ != address(0),
            "JTP: the address of DEXLFactory is 0"
        );
        _fanToArtistStaking = staking_;
        _dexlFactory = dexlFactory_;
    }

    function transferOwnership(
        address to
    ) public override(IJTP, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount) external override onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external override onlyOwner {
        _burn(_msgSender(), amount);
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external override onlyOwner {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    //Safe since it can be called only by FanToArtistStaking, could add a mapping(address => amount) to check if someone is unlocking more than what he previously locked
    function lock(
        address from,
        uint256 amount
    ) external override onlyStaking returns (bool) {
        _transfer(from, _msgSender(), amount);
        return true;
    }

    function payArtist(address to, uint256 amount) external override onlyTP {
        _mint(to, amount);
    }
}
