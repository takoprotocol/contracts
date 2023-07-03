export const LensHubAbi = [
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
    ],
    name: 'ownerOf',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'profileId',
            type: 'uint256',
          },
          {
            internalType: 'string',
            name: 'contentURI',
            type: 'string',
          },
          {
            internalType: 'address',
            name: 'collectModule',
            type: 'address',
          },
          {
            internalType: 'bytes',
            name: 'collectModuleInitData',
            type: 'bytes',
          },
          {
            internalType: 'address',
            name: 'referenceModule',
            type: 'address',
          },
          {
            internalType: 'bytes',
            name: 'referenceModuleInitData',
            type: 'bytes',
          },
          {
            components: [
              {
                internalType: 'uint8',
                name: 'v',
                type: 'uint8',
              },
              {
                internalType: 'bytes32',
                name: 'r',
                type: 'bytes32',
              },
              {
                internalType: 'bytes32',
                name: 's',
                type: 'bytes32',
              },
              {
                internalType: 'uint256',
                name: 'deadline',
                type: 'uint256',
              },
            ],
            internalType: 'struct DataTypes.EIP712Signature',
            name: 'sig',
            type: 'tuple',
          },
        ],
        internalType: 'struct DataTypes.PostWithSigData',
        name: 'vars',
        type: 'tuple',
      },
    ],
    name: 'postWithSig',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'profileId',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'profileIdPointed',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'pubIdPointed',
            type: 'uint256',
          },
          {
            internalType: 'bytes',
            name: 'referenceModuleData',
            type: 'bytes',
          },
          {
            internalType: 'address',
            name: 'referenceModule',
            type: 'address',
          },
          {
            internalType: 'bytes',
            name: 'referenceModuleInitData',
            type: 'bytes',
          },
          {
            components: [
              {
                internalType: 'uint8',
                name: 'v',
                type: 'uint8',
              },
              {
                internalType: 'bytes32',
                name: 'r',
                type: 'bytes32',
              },
              {
                internalType: 'bytes32',
                name: 's',
                type: 'bytes32',
              },
              {
                internalType: 'uint256',
                name: 'deadline',
                type: 'uint256',
              },
            ],
            internalType: 'struct DataTypes.EIP712Signature',
            name: 'sig',
            type: 'tuple',
          },
        ],
        internalType: 'struct DataTypes.MirrorWithSigData',
        name: 'vars',
        type: 'tuple',
      },
    ],
    name: 'mirrorWithSig',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'profileId',
            type: 'uint256',
          },
          {
            internalType: 'string',
            name: 'contentURI',
            type: 'string',
          },
          {
            internalType: 'uint256',
            name: 'profileIdPointed',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'pubIdPointed',
            type: 'uint256',
          },
          {
            internalType: 'bytes',
            name: 'referenceModuleData',
            type: 'bytes',
          },
          {
            internalType: 'address',
            name: 'collectModule',
            type: 'address',
          },
          {
            internalType: 'bytes',
            name: 'collectModuleInitData',
            type: 'bytes',
          },
          {
            internalType: 'address',
            name: 'referenceModule',
            type: 'address',
          },
          {
            internalType: 'bytes',
            name: 'referenceModuleInitData',
            type: 'bytes',
          },
          {
            components: [
              {
                internalType: 'uint8',
                name: 'v',
                type: 'uint8',
              },
              {
                internalType: 'bytes32',
                name: 'r',
                type: 'bytes32',
              },
              {
                internalType: 'bytes32',
                name: 's',
                type: 'bytes32',
              },
              {
                internalType: 'uint256',
                name: 'deadline',
                type: 'uint256',
              },
            ],
            internalType: 'struct DataTypes.EIP712Signature',
            name: 'sig',
            type: 'tuple',
          },
        ],
        internalType: 'struct DataTypes.CommentWithSigData',
        name: 'vars',
        type: 'tuple',
      },
    ],
    name: 'commentWithSig',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export const lensFreeCollectModuleAbi = [];
