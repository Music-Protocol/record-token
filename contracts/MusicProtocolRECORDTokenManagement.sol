// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol"; //to mint and burn
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IMusicProtocolRECORDToken.sol";
import "./interfaces/IArtistStaking.sol";

contract MusicProtocolRECORDTokenManagement is AccessControl {
    event Mint(address indexed to, uint256 amount, address indexed sender);
    event Burn(address indexed from, uint256 amount, address indexed sender);
    event MusicProtocolRECORDTokenChanged(address indexed newAddress);
    event ArtistStakingChanged(address indexed newAddress);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant TGE_ROLE = keccak256("TGE_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant VERIFY_ARTIST_ROLE = keccak256("VERIFY_ARTIST_ROLE");
    bytes32 public constant REMOVE_ARTIST_ROLE = keccak256("REMOVE_ARTIST_ROLE");

    IMusicProtocolRECORDToken private _MusicProtocolRECORDToken;
    IArtistStaking private _ftas;

    constructor(address MusicProtocolRECORDToken_, address ftas_) {
        require(
            MusicProtocolRECORDToken_ != address(0),
            "MusicProtocolRECORDTokenManagement: MusicProtocolRECORDToken address can not be 0"
        );
        require(
            ftas_ != address(0),
            "MusicProtocolRECORDTokenManagement: ArtistStaking address can not be 0"
        );
        _MusicProtocolRECORDToken = IMusicProtocolRECORDToken(MusicProtocolRECORDToken_);
        _ftas = IArtistStaking(ftas_);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
        _grantRole(VERIFY_ARTIST_ROLE, msg.sender);
        _grantRole(REMOVE_ARTIST_ROLE, msg.sender);
        _grantRole(TGE_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _MusicProtocolRECORDToken.mint(to, amount);
        emit Mint(to, amount, _msgSender());
    }

    function mint_and_lock(
        address to,
        uint256 amount,
        uint64 start,
        uint64 duration
    ) external onlyRole(TGE_ROLE) {
        _MusicProtocolRECORDToken.mint_and_lock(to, amount, start, duration);
    }

    function transfer_and_lock(
        address from,
        address to,
        uint256 amount,
        uint64 start,
        uint64 duration
    ) external onlyRole(TGE_ROLE) {
        _MusicProtocolRECORDToken.transfer_and_lock(from, to, amount, start, duration);
    }

    // note that with burn you do not burn the tokens of the caller(msg.sender) but of the current contract(MusicProtocolRECORDTokenManament)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _MusicProtocolRECORDToken.burn(amount);
        emit Burn(address(this), amount, _msgSender());
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _MusicProtocolRECORDToken.burnFrom(account, amount);
        emit Burn(account, amount, _msgSender());
    }

    function transferMusicProtocolRECORDToken(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _MusicProtocolRECORDToken.transferOwnership(to);
    }

    function transferArtistStaking(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas.transferOwnership(to);
    }

    function addArtist(
        address[] calldata artist
    ) external onlyRole(VERIFY_ARTIST_ROLE) {
        for (uint256 i = 0; i < artist.length; i++) {
            _ftas.addArtist(artist[i], _msgSender());
        }
    }

    function removeArtist(
        address[] calldata artist
    ) external onlyRole(REMOVE_ARTIST_ROLE) {
        for (uint256 i = 0; i < artist.length; i++) {
            _ftas.removeArtist(artist[i], _msgSender());
        }
    }

    function pauseMusicProtocolRECORDToken() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _MusicProtocolRECORDToken.pause();
    }

    function unpauseMusicProtocolRECORDToken()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _MusicProtocolRECORDToken.unpause();
    }

    function changeArtistRewardRate(
        uint256 rate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas.changeArtistRewardRate(rate, _msgSender());
    }

    function changeMusicProtocolRECORDToken(
        address MusicProtocolRECORDToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            MusicProtocolRECORDToken != address(0),
            "MusicProtocolRECORDTokenManagement: MusicProtocolRECORDToken address can not be 0"
        );
        _MusicProtocolRECORDToken = IMusicProtocolRECORDToken(MusicProtocolRECORDToken);
        emit MusicProtocolRECORDTokenChanged(MusicProtocolRECORDToken);
    }

    function changeFTAS(address ftas) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            ftas != address(0),
            "MusicProtocolRECORDTokenManagement: ArtistStaking address can not be 0"
        );
        _ftas = IArtistStaking(ftas);
        emit ArtistStakingChanged(ftas);
    }

    function custom(
        address[] memory targets,
        bytes[] memory calldatas
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < targets.length; ++i) {
            (bool success, bytes memory returndata) = targets[i].call(
                calldatas[i]
            );
            Address.verifyCallResult(
                success,
                returndata,
                "MusicProtocolRECORDTokenManagement: call reverted without message"
            );
        }
    }
}
