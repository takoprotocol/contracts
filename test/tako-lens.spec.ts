import { expect } from 'chai';
import {
  deployer,
  lensHubMock,
  makeSuiteCleanRoom,
  takoLensHub,
  erc20Token,
  testWallet,
  user,
  user1,
  users,
  lensFreeCollectModule,
} from './__setup.spec';
import { ERRORS } from './helpers/errors';
import {
  ADDRESS_ZERO,
  AuditState,
  EVMMine,
  EVMIncreaseTime,
} from './shared/utils';
import { ethers } from 'hardhat';
import { getLoanWithSigParts } from './shared/sign';

const BID_AMOUNT = 100000;
const DAY = 86400;
const FEE_DENOMINATOR = 10000000000;
let officialFeeRate = 0;
let profileOwner = users[0];
let profileOwner1 = users[1];
let relayer = testWallet;
const contentId = '0x01-01';

makeSuiteCleanRoom('TakoLensHub', () => {
  context('Gov', () => {
    beforeEach(async () => {
      await init();
    });
    it('Should fail to set whitelist token if sender does not own the contract', async () => {
      await expect(
        takoLensHub.connect(user).whitelistBidToken(ADDRESS_ZERO, true)
      ).to.be.reverted;
    });
    it('Should fail to set whitelist relayer if sender does not own the contract', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .whitelistBidToken(await user1.getAddress(), true)
      ).to.be.reverted;
    });
    it('Should fail to set fee collector if sender does not own the contract', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .setFeeCollector(deployer.getAddress(), 100000000)
      ).to.be.reverted;
    });
    it('Should fail to set profile limit if sender does not own the contract', async () => {
      await expect(takoLensHub.connect(user).setToProfileLimit(20)).to.reverted;
    });
    // it('Should success to set whitelist token', async () => {
    //   await expect(
    //     takoLensHub.connect(deployer).whitelistBidToken(ADDRESS_ZERO, true)
    //   ).to.not.reverted;
    // });
    it('Should success to set whitelist relayer', async () => {
      await expect(
        takoLensHub
          .connect(deployer)
          .whitelistBidToken(await user.getAddress(), true)
      ).to.not.reverted;
    });
    it('Should success to set lens hub', async () => {
      await expect(
        takoLensHub
          .connect(deployer)
          .setLensContracts(lensHubMock.address, lensFreeCollectModule.address)
      ).to.not.reverted;
    });
    it('Should success to set fee collector', async () => {
      await expect(
        takoLensHub
          .connect(deployer)
          .setFeeCollector(deployer.getAddress(), 100000000)
      ).to.not.reverted;
    });
    it('Should success to set profile limit', async () => {
      await expect(takoLensHub.connect(deployer).setToProfileLimit(20)).to.not
        .reverted;
    });
  });

  context('User bid evm', () => {
    beforeEach(async () => {
      await init();
    });
    it('Should Fail to bid if ths sender not whitelist', async () => {
      await expect(
        takoLensHub
          .connect(deployer)
          .setMerkleRoot(
            '0x6da010d92588a7015cfbba43d76af2ff58f4333351f7a5f6d9eba8cffcef89fc'
          )
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            0,
            getMerkleBaseData(1, [
              '0xcf119d2152e5d3087fb516f978fea305a80c2feee347433ccdfd77a2ef67d2f2',
              '0x72d1b837a68a23075f2c8399bb889eca16144f18ecdbf98c3643d5f0fcb55995',
              '0xfeffa1e95c85617663e204ee34ff063aa0f0e5e47ce4b9cefe5057a0b1295648',
              '0x329c0dded61786c21a44b54c8f24a40776866b4ad0a1b8f1ba1b3714bd546239',
            ])
          )
      ).to.revertedWith(ERRORS.NOT_WHITELISTED);
    });
    it('Should fail to bid if the duration limit exceeded', async () => {
      const maxDuration = (await takoLensHub.maxDuration()).toNumber();
      await expect(
        takoLensHub.connect(user).bid(
          {
            contentURI: '',
            profileIdPointed: 1,
            pubIdPointed: 1,
            bidToken: ADDRESS_ZERO,
            bidAmount: BID_AMOUNT,
            duration: DAY * maxDuration + DAY,
            toProfiles: [1],
          },
          0,
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.DURATION_LIMIT_EXCEEDED);
    });
    it('Should fail to bid if the to profile limit exceeded', async () => {
      const toProfiles = [];
      for (let i = 0; i < 10; i++) {
        toProfiles.push(i);
      }
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(toProfiles), 0, getMerkleBaseData())
      ).to.revertedWith(ERRORS.TO_PROFILE_LIMIT_EXCEEDED);
    });
    it('Should fail to bid if the amount not reached minimum', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setMinBid(ADDRESS_ZERO, BID_AMOUNT + 1)
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, getMerkleBaseData())
      ).to.revertedWith(ERRORS.NOT_REACHED_MINIMUM);
    });
    it('Should fail to bid if insufficient input amount', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, getMerkleBaseData(), {
            value: BID_AMOUNT - 1,
          })
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it('Should fail to bid if the bid token not whitelisted', async () => {
      await expect(
        takoLensHub.connect(user).bid(
          {
            contentURI: '',
            profileIdPointed: 1,
            pubIdPointed: 1,
            bidToken: erc20Token.address,
            bidAmount: BID_AMOUNT,
            duration: DAY,
            toProfiles: [1],
          },
          0,
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.BID_TOKEN_NOT_WHITELISTED);
    });
    it('Should fail to bid if the bid type not allowed', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setDisableAuditTypes([true, false, false])
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.revertedWith(ERRORS.BID_TYPE_NOT_ACCEPT);
    });
    it('Should Success to bid post when set merkle root', async () => {
      await expect(
        takoLensHub
          .connect(deployer)
          .setMerkleRoot(
            '0x6da010d92588a7015cfbba43d76af2ff58f4333351f7a5f6d9eba8cffcef89fc'
          )
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bid(
            getBidBaseParams(),
            0,
            getMerkleBaseData(4, [
              '0xac54a44045f747190b78564a40c69f04ae53ab45cc0c6661b42f1d67f8d226b6',
              '0x336803c370ba7f390432d11d86955ccac5bc6df54231824a7c01a07430e73550',
              '0x6d91567d1ddac6003435f8f073607b2bd660838dab8dec605e0f8bc3e89ae398',
              '0x516c4e3c60008bb84f25bbafbe1f58add8fb6e3df9ca41dc7112e1d41a831426',
              '0x1360e199edfe36500630b239a37004ab1dc4ed4a5053e203ee975f4ed34ba84c',
            ]),
            { value: BID_AMOUNT }
          )
      ).to.not.reverted;
    });
    it('Should success to bid post', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 0, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoLensHub.getBidCounter()).to.eq(1);
    });
    it('Should success to bid comment', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 1, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoLensHub.getBidCounter()).to.eq(1);
    });
    it('Should success to bid mirror', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bid(getBidBaseParams(), 2, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoLensHub.getBidCounter()).to.eq(1);
    });
  });

  context('User update bid evm', () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it('Should success to update bid', async () => {
      await expect(takoLensHub.connect(user).updateBid(1, 1, 1, { value: 1 }))
        .to.not.reverted;
    });
  });

  context('User cancel bid', () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it('Should fail to cancel bid if index error', async () => {
      await expect(takoLensHub.connect(user).claimBackBid(10)).to.revertedWith(
        ERRORS.PARAMS_INVALID
      );
    });
    it('Should fail to cancel bid if not bidder', async () => {
      await expect(takoLensHub.connect(user1).claimBackBid(1)).to.revertedWith(
        ERRORS.NOT_BIDDER
      );
    });
    it('Should fail to cancel bid if not expired', async () => {
      await expect(takoLensHub.connect(user).claimBackBid(1)).to.revertedWith(
        ERRORS.NOT_EXPIRED
      );
    });
    it('Should fail to cancel bid if bid closed', async () => {
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 1, getEmptySig())
      ).to.not.reverted;
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(takoLensHub.connect(user).claimBackBid(1)).to.revertedWith(
        ERRORS.BID_IS_CLOSE
      );
    });
    it('Should success to cancel bid', async () => {
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(user).claimBackBid(1)
      ).to.changeEtherBalances([user, takoLensHub], [BID_AMOUNT, -BID_AMOUNT]);
      await expect(
        takoLensHub.connect(user).claimBackBidBatch([2, 3])
      ).to.changeEtherBalances(
        [user, takoLensHub],
        [BID_AMOUNT * 2, -BID_AMOUNT * 2]
      );
    });
  });

  context('Curator audit', () => {
    beforeEach(async () => {
      await init();
      await initBid();
    });
    it('Should fail to audit if index error', async () => {
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(10, 1, getEmptySig())
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it('Should fail to audit if the bid expired', async () => {
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 1, getEmptySig())
      ).to.revertedWith(ERRORS.EXPIRED);
      ethers.constants.HashZero;
    });
    it('Should fail to audit if sender not profile Owner', async () => {
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 2, getEmptySig())
      ).to.revertedWith(ERRORS.NOT_PROFILE_OWNER);
    });
    it('Should fail to audit if sender not curator', async () => {
      await expect(
        takoLensHub.connect(profileOwner1).auditBidPost(1, 2, getEmptySig())
      ).to.revertedWith(ERRORS.NOT_CURATOR);
    });
    it('Should success to audit post', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub.connect(profileOwner).auditBidPost(1, 1, getEmptySig())
      ).changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getContentByIndex(1)).state).to.eq(
        AuditState.Pass
      );
    });
    it('Should success to audit comment', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub.connect(profileOwner).auditBidComment(2, 1, getEmptySig())
      ).changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getContentByIndex(2)).state).to.eq(
        AuditState.Pass
      );
    });
    it('Should success to audit mirror', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub.connect(profileOwner).auditBidMirror(3, 1, getEmptySig())
      ).changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getContentByIndex(3)).state).to.eq(
        AuditState.Pass
      );
    });
  });

  context('User bid momoka', () => {
    beforeEach(async () => {
      await init();
    });
    it('Should fail to bid if the duration limit exceeded', async () => {
      const maxDuration = (await takoLensHub.maxDuration()).toNumber();
      await expect(
        takoLensHub.connect(user).bidMomoka(
          {
            contentURI: '',
            mirror: '',
            commentOn: '',
            bidToken: ADDRESS_ZERO,
            bidAmount: BID_AMOUNT,
            duration: DAY * maxDuration + DAY,
            toProfiles: [1],
          },
          0,
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.DURATION_LIMIT_EXCEEDED);
    });
    it('Should fail to bid if the to profile limit exceeded', async () => {
      const toProfiles = [];
      for (let i = 0; i < 10; i++) {
        toProfiles.push(i);
      }
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(toProfiles), 0, getMerkleBaseData())
      ).to.revertedWith(ERRORS.TO_PROFILE_LIMIT_EXCEEDED);
    });
    it('Should fail to bid if the amount not reached minimum', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setMinBid(ADDRESS_ZERO, BID_AMOUNT + 1)
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, getMerkleBaseData())
      ).to.revertedWith(ERRORS.NOT_REACHED_MINIMUM);
    });
    it('Should fail to bid if insufficient input amount', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, getMerkleBaseData(), {
            value: BID_AMOUNT - 1,
          })
      ).to.revertedWith(ERRORS.INSUFFICIENT_INPUT_AMOUNT);
    });
    it('Should fail to bid if the bid token not whitelisted', async () => {
      await expect(
        takoLensHub.connect(user).bidMomoka(
          {
            contentURI: '',
            commentOn: '',
            mirror: '',
            bidToken: erc20Token.address,
            bidAmount: BID_AMOUNT,
            duration: DAY,
            toProfiles: [1],
          },
          0,
          getMerkleBaseData()
        )
      ).to.revertedWith(ERRORS.BID_TOKEN_NOT_WHITELISTED);
    });
    it('Should fail to bid if the bid type not allowed', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .setDisableAuditTypes([true, false, false])
      ).to.not.reverted;
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.revertedWith(ERRORS.BID_TYPE_NOT_ACCEPT);
    });
    it('Should success to bid post', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 0, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoLensHub.getMomokaBidCounter()).to.eq(1);
    });
    it('Should success to bid comment', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 1, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoLensHub.getMomokaBidCounter()).to.eq(1);
    });
    it('Should success to bid mirror', async () => {
      await expect(
        takoLensHub
          .connect(user)
          .bidMomoka(getBidMomokaBaseParams(), 2, getMerkleBaseData(), {
            value: BID_AMOUNT,
          })
      ).to.not.reverted;
      expect(await takoLensHub.getMomokaBidCounter()).to.eq(1);
    });
  });

  context('User cancel bid momoka', () => {
    beforeEach(async () => {
      await init();
      await initMomokaBid();
    });
    it('Should fail to cancel bid if index error', async () => {
      await expect(
        takoLensHub.connect(user).claimBackBidMomoka(10)
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it('Should fail to cancel bid if not bidder', async () => {
      await expect(
        takoLensHub.connect(user1).claimBackBidMomoka(1)
      ).to.revertedWith(ERRORS.NOT_BIDDER);
    });
    it('Should fail to cancel bid if not expired', async () => {
      await expect(
        takoLensHub.connect(user).claimBackBidMomoka(1)
      ).to.revertedWith(ERRORS.NOT_EXPIRED);
    });
    it('Should fail to cancel bid if bid closed', async () => {
      const deadline = new Date().getTime() + DAY;
      await expect(
        takoLensHub
          .connect(deployer)
          .whitelistRelayer(await relayer.getAddress(), true)
      ).to.not.reverted;
      const { v, r, s } = await getLoanWithSigParts(
        1,
        await profileOwner.getAddress(),
        contentId,
        deadline,
        takoLensHub.address
      );
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, testWallet.address, contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.not.reverted;
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(user).claimBackBidMomoka(1)
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it('Should success to cancel bid', async () => {
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(
        takoLensHub.connect(user).claimBackBidMomoka(1)
      ).to.changeEtherBalances([user, takoLensHub], [BID_AMOUNT, -BID_AMOUNT]);
      await expect(
        takoLensHub.connect(user).claimBackBidMomokaBatch([2, 3])
      ).to.changeEtherBalances(
        [user, takoLensHub],
        [BID_AMOUNT * 2, -BID_AMOUNT * 2]
      );
    });
  });

  context('Momoka loan', async () => {
    const deadline = new Date().getTime() + DAY;
    let v: number;
    let r: string;
    let s: string;
    beforeEach(async () => {
      await init();
      await initMomokaBid();
      await expect(
        takoLensHub
          .connect(deployer)
          .whitelistRelayer(await relayer.getAddress(), true)
      ).to.not.reverted;
      ({
        v: v,
        r: r,
        s: s,
      } = await getLoanWithSigParts(
        1,
        await profileOwner.getAddress(),
        contentId,
        deadline,
        takoLensHub.address
      ));
    });
    it('Should fail to loan if the index error', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(10, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.PARAMS_INVALID);
    });
    it('Should fail to loan if the bid is close', async () => {
      await EVMIncreaseTime(DAY * 2);
      await EVMMine();
      await expect(takoLensHub.connect(user).claimBackBidMomoka(1)).to.not
        .reverted;
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.BID_IS_CLOSE);
    });
    it('Should fail to loan if the profile error', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner1)
          .loanWithSig(1, 1, relayer.address, contentId, { v, r, s, deadline })
      ).to.revertedWith(ERRORS.NOT_PROFILE_OWNER);
    });
    it('Should fail to loan if the sig error', async () => {
      await expect(
        takoLensHub
          .connect(profileOwner1)
          .loanWithSig(1, 1, await profileOwner.getAddress(), contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.reverted;
    });
    it('Should success to loan with sig', async () => {
      const officialFee = (BID_AMOUNT * officialFeeRate) / FEE_DENOMINATOR;
      await expect(
        takoLensHub
          .connect(profileOwner)
          .loanWithSig(1, 1, relayer.address, contentId, {
            v,
            r,
            s,
            deadline,
          })
      ).to.changeEtherBalances(
        [deployer, profileOwner, takoLensHub],
        [officialFee, BID_AMOUNT - officialFee, -BID_AMOUNT]
      );
      expect((await takoLensHub.getMomokaContentByIndex(1)).state).to.eq(
        AuditState.Pass
      );
    });
  });
});

async function init() {
  relayer = testWallet;
  profileOwner = users[0];
  profileOwner1 = users[1];
  officialFeeRate = (await takoLensHub.feeRate()).toNumber();
  await expect(
    takoLensHub
      .connect(deployer)
      .setGovernance(await deployer.getAddress(), true)
  ).to.not.reverted;
}

async function initBid() {
  await expect(
    takoLensHub.connect(user).bid(getBidBaseParams(), 0, getMerkleBaseData(), {
      value: BID_AMOUNT,
    })
  ).to.not.reverted;
  await expect(
    takoLensHub.connect(user).bid(getBidBaseParams(), 1, getMerkleBaseData(), {
      value: BID_AMOUNT,
    })
  ).to.not.reverted;
  await expect(
    takoLensHub.connect(user).bid(getBidBaseParams(), 2, getMerkleBaseData(), {
      value: BID_AMOUNT,
    })
  ).to.not.reverted;
}

async function initMomokaBid() {
  await expect(
    takoLensHub
      .connect(user)
      .bidMomoka(getBidMomokaBaseParams(), 0, getMerkleBaseData(), {
        value: BID_AMOUNT,
      })
  ).to.not.reverted;
  await expect(
    takoLensHub
      .connect(user)
      .bidMomoka(getBidMomokaBaseParams(), 1, getMerkleBaseData(), {
        value: BID_AMOUNT,
      })
  ).to.not.reverted;
  await expect(
    takoLensHub
      .connect(user)
      .bidMomoka(getBidMomokaBaseParams(), 2, getMerkleBaseData(), {
        value: BID_AMOUNT,
      })
  ).to.not.reverted;
}

function getBidBaseParams(toProfiles: number[] = [1]) {
  return {
    contentURI: '',
    profileIdPointed: 1,
    pubIdPointed: 1,
    bidToken: ADDRESS_ZERO,
    bidAmount: BID_AMOUNT,
    duration: DAY,
    toProfiles: toProfiles,
  };
}

function getBidMomokaBaseParams(toProfiles: number[] = [1]) {
  return {
    contentURI: '',
    mirror: '',
    commentOn: '',
    bidToken: ADDRESS_ZERO,
    bidAmount: BID_AMOUNT,
    duration: DAY,
    toProfiles: toProfiles,
  };
}

function getMerkleBaseData(index?: number, merkleProof?: string[]) {
  return {
    index: index || 0,
    merkleProof: merkleProof || [],
  };
}

function getEmptySig() {
  return {
    v: 1,
    r: ethers.utils.formatBytes32String(''),
    s: ethers.utils.formatBytes32String(''),
    deadline: 1,
  };
}
