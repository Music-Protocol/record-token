// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

interface IFanToArtistStaking {
    function addArtist(address artist, address sender) external;

    function removeArtist(address artist, address sender) external;

    function transferOwnership(address to) external;
}