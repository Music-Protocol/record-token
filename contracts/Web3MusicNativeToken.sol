// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";

contract Web3MusicNativeToken is
    IWeb3MusicNativeToken,
    ERC20,
    Ownable2Step,
    Pausable
{
    address private immutable _fanToArtistStaking;

    //for the function callable only by FanToArtistStaking.sol
    modifier onlyStaking() {
        require(
            _fanToArtistStaking == _msgSender(),
            "Web3MusicNativeToken: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    modifier onlyTP() {
        require(
            _fanToArtistStaking == _msgSender(),
            "Web3MusicNativeToken: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    constructor(
        address staking_,
        address factory_
    ) ERC20("Web3MusicNativeToken", "W3M") {
        require(
            staking_ != address(0),
            "Web3MusicNativeToken: the address of FanToArtistStaking is 0"
        );
        require(
            factory_ != address(0),
            "Web3MusicNativeToken: the address of DEXLFactory is 0"
        );
        _fanToArtistStaking = staking_;
        _dexlFactory = factory_; //rimuovo factory dal constructor?
    }

    function transferOwnership(
        address to
    ) public override(IWeb3MusicNativeToken, Ownable2Step) onlyOwner {
        super.transferOwnership(to);
    }

    function renounceOwnership(
    ) public override(Ownable) onlyOwner {
        require(false, "function disabled");
        super.renounceOwnership();
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

    function pay(address to, uint256 amount) external override onlyTP {
        _mint(to, amount);
    }
}
