const discord = require('discord.js');
const client = new discord.Client({ disabledEvents: [ 'TYPING_START', 'PRESENCE_UPDATE' ] });

// stack trace for unhandledRejection errors
process.on('unhandledRejection', r => console.error(r));

// #region sending sticker

const rp = require('request-promise');

async function sendSticker(message, client) {
  // 只处理 guild 消息
  if (message.channel.type !== 'text') return;
  // 提取命令
  const command = message.content.trim().toLowerCase().replace(/(:|;)/g, '');
  // 提取名称
  const authorName = message.member && message.member.nickname ? message.member.nickname : message.author.username;
  // 获取 webhook
  async function getStickerWebhook(channel) {
    const hooks = await channel.guild.fetchWebhooks();
    const hook = hooks.find(hook => {
      if (!hook.owner) return false;
      return hook.owner.id === client.user.id;
    });
    if (hook) return hook;
    return await channel.createWebhook("stickerbot", client.user.displayAvatarURL);
  }
  // append `size` querystring to avatarURL
  function resizeAvatarURL(avatarURL, size) {
    const baseURL = avatarURL.includes('?')
      ? avatarURL.substr(0, avatarURL.indexOf('?'))
      : avatarURL;
    return `${baseURL}?size=${size}`;
  }
  // 应用 sticker
  async function useSticker(sticker) {
    const messageOpts = { files: [ { attachment: sticker.url, name: `${sticker.name}.png` } ] }
    try {
      // delete original message
      if (message.channel.memberPermissions(client.user).has('MANAGE_MESSAGES')) message.delete();
      // webhook style sticker
      if (message.channel.memberPermissions(client.user).has('MANAGE_WEBHOOKS')) {
        const hook = await getStickerWebhook(message.channel);
        // update webhook channel
        if (hook.channelID !== message.channel.id) {
          try {
            await rp({
              method: 'PATCH',
              uri: `https://discordapp.com/api/webhooks/${hook.id}`,
              headers: { 'Authorization': `Bot ${process.env.DISCORD_TOKEN}` },
              body: { channel_id: message.channel.id },
              json: true,
            });
          } catch (err) {
            return message.channel.send(
              `**Error:** Make sure this bot has permission to manage webhooks in EVERY channel.`
            );
          }
        }
        // send message
        // discord requires webhook name to be minimum 2-char
        // spread operator below provides more accurate char count for usernames that can potentially include emojis
        // see: stackoverflow.com/a/37535876
        messageOpts.username = ([...authorName].length > 1) ? authorName : `${authorName}.`;
        messageOpts.avatarURL = resizeAvatarURL(message.author.displayAvatarURL, 64);
        await hook.send(messageOpts);
        return true;
      }
    } catch (err) {
      handleSendStickerError(err);
    }
  }
  // 异常处理把手
  function handleSendStickerError(err) {
    if (err.statusCode) err.status = err.statusCode;
    if (err.status === 404) return;
    console.error(`
			====

			Guild: ${message.guild.id}
			Message: ${message.content}
			Time: ${(new Date().toLocaleString('en-US', { timezone: 'PST' }))}
			Error Code: ${err.code ? err.code : 'N/A'}
			Error Message: ${err.message}
			Error Stack: ${(err.stack.length > 300) ? err.stack.substr(0, 300) + '...\ntruncated after 300 characters' : err.stack}

			====
		`.replace(/\t+/g, ''));
  }

  // 忽略空命令
  console.log(`Command: ${command}`);
  if (!command.length) return;

  const guild = message.guild;
  let stickerPack, stickerName, uri;

  // sticker pack
  if (command.includes('-')) {
    stickerPack = command.split('-')[0];
    stickerName = command.split('-')[1];
    uri = `${process.env.APP_URL}/api/sticker-packs/${stickerPack}/stickers/${stickerName}`
  // sticker only
  } else {
    stickerName = command;
    uri = `${process.env.APP_URL}/api/guilds/${guild.id}/stickers/${stickerName}`
  }

  rp({ method: 'GET', uri, json: true })
  .then(useSticker)
  .catch(handleSendStickerError);
}

// #endregion

// on sticker message

const P_STICKER = /^((:|;)[a-zA-Z0-9-]+(:|;))$/;

function onStickerMessage(message) {
  if(message.author.bot) return false;
  if (!P_STICKER.test(message.content.trim())) return false;
  return sendSticker(message, client);
}

// bot events

client.on('ready', () => {
  console.log(`sticker bot is live: ${client.user.username} (${client.user.id})`);
  console.log(`------`);
  for (const g of client.guilds.array()) {
    console.log(`${g.name} (${g.id})`);
  }
  console.log(`------`);
});
client.on('message', message => onStickerMessage(message));
client.on('messageUpdate', (_, message) => onStickerMessage(message));
client.login(process.env.DISCORD_TOKEN);
