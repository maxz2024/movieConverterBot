const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const util = require('node:util');
const archiver = require('archiver'); // Импортируем пакет archiver
const exec = util.promisify(require('node:child_process').exec);


async function getUsers() {
    try {
        const data = await fs.promises.readFile('users.json', 'utf8');
        const users = JSON.parse(data);
        return users.users;
    } catch (error) {
        console.error('Ошибка чтения файла users.json:', error);
        return [];
    }
}

async function addUser(userId) {
    try {
        const data = await fs.promises.readFile('users.json', 'utf8');
        const users = JSON.parse(data);
        if (!users.users.includes(userId)) {
            users.users.push(userId);
            await fs.promises.writeFile('users.json', JSON.stringify(users, null, 2));
            console.log(`Пользователь с id ${userId} добавлен в список.`);
        } else {
            console.log(`Пользователь с id ${userId} уже в списке.`);
        }
    } catch (error) {
        console.error('Ошибка при добавлении пользователя в файл users.json:', error);
    }
}

async function removeUser(userId) {
    try {
        const data = await fs.promises.readFile('users.json', 'utf8');
        const users = JSON.parse(data);
        if (users.users.includes(userId)) {
            users.users = users.users.filter(id => id !== userId);
            await fs.promises.writeFile('users.json', JSON.stringify(users, null, 2));
            console.log(`Пользователь с id ${userId} удален из списка.`);
        } else {
            console.log(`Пользователь с id ${userId} не найден в списке.`);
        }
    } catch (error) {
        console.error('Ошибка при удалении пользователя из файла users.json:', error);
    }
}


let status = false
const bot = new TelegramBot("7840963225:AAFgpRY_fohGJkpAQs8z0QImyV6ruPQzs6E", {
    polling: {
        interval: 300,
        autoStart: true,
    },
});

async function archiveFiles(userId, type) {
    const output = fs.createWriteStream(`./documents/${userId}/archive_${type}.zip`);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Уровень сжатия
    });

    output.on('close', async () => {
        await bot.sendDocument(userId, `./documents/${userId}/archive_${type}.zip`, { contentType: 'application/zip' }); // Указываем contentType
        fs.unlink(`./documents/${userId}/output_${type}.mp4`, (err) => {
            if (err) throw err;
        });
        fs.unlink(`./documents/${userId}/archive_${type}.zip`, (err) => {
            if (err) throw err;
        });
        status = false
    });

    archive.on('error', (err) => {
        throw err;
    });

    archive.pipe(output);
    archive.file(`./documents/${userId}/output_${type}.mp4`, { name: `output_${type}.mp4` }); // Добавляем output_ios.mp4 в архив
    await archive.finalize(); // Завершаем архивирование
}


async function MainBot() {
    // await sendMessageWithSecondBot("test")
    botInfo = await bot.getMe();
    console.warn(`Бот @${botInfo.username} запущен`);
    bot.on("polling_error", (err) => console.log(err.data.error.message));

    bot.on("text", async (msg) => {
        let users = await getUsers()
        const userId = msg.from.id;

        if (msg.text === "/start") {
            if (!users.includes(userId)) {
                await bot.sendMessage(userId, "Привет. Этот бот создает видео для публикации видео не проходящее модерацию. Для получения доступа писать в лс @ruNewton", { reply_markup: { inline_keyboard: [[{ "text": "Получить доступ", url: "t.me/ruNewton" }]] } })
                return
            }

            await bot.sendMessage(userId, "Привет. Отправь мне два файла с расширением .mp4. Не забудь их подписать в тексте сообщения:\n\npreview - 'шторка'\nhidden - основное видео\n\n ‼️ ВИДЕО ДОЛЖННЫ БЫТЬ ОДНОЙ ДЛИНОЙ И РАЗМЕР НЕ БОЛЕЕ 20МБ(ограничения телеграмм) ‼️\n\n Автор: @ruNewton")
        }
        else if (msg.text == "/ios") {
            if (!users.includes(userId)) {
                await bot.sendMessage(userId, "Привет. Этот бот создает видео для публикации видео не проходящее модерацию. Для получения доступа писать в лс @ruNewton", { reply_markup: { inline_keyboard: [[{ "text": "Получить доступ", url: "t.me/ruNewton" }]] } })
                return
            }

            let filePath = `./documents/${userId}`;
            if (fs.existsSync(filePath) && fs.existsSync(`${filePath}/hidden.mp4`) && fs.existsSync(`${filePath}/preview.mp4`)) {
                if (status) {
                    await bot.sendMessage(userId, "Процесс занят. Попробуй позже.")
                    return
                }
                else {
                    status = true
                }
                let msg = await bot.sendMessage(userId, "Готовлю ваши видео к шифрованию")
                await exec(`ffmpeg -i ${filePath}/preview.mp4 -vf "scale=720:1280, fps=30" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k ${filePath}/preview_fixed.mp4`)
                await exec(`ffmpeg -i ${filePath}/hidden.mp4 -vf "scale=720:1280, fps=30" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k ${filePath}/hidden_fixed.mp4`)
                await bot.editMessageText("Создаю видео", { chat_id: userId, message_id: msg.message_id })
                await exec(`ffmpeg -i ${filePath}/preview_fixed.mp4 -i ${filePath}/hidden_fixed.mp4 -map 0:v -map 0:a -map 1:v -map 1:a -c:v libx264 -profile:v baseline -level 3.0 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart ${filePath}/output_ios.mp4`)
                if (fs.existsSync(`${filePath}/output_ios.mp4`)) {
                    fs.unlinkSync(`${filePath}/preview_fixed.mp4`);
                    fs.unlinkSync(`${filePath}/hidden_fixed.mp4`);

                    await bot.editMessageText("Готовлю архив...", { chat_id: userId, message_id: msg.message_id })
                    await archiveFiles(userId, "ios");
                }
            } else {
                await bot.sendMessage(userId, "В папке documents отсутствуют файлы: hidden и preview");
            }
        }
        else if (msg.text == "/and") {
            if (!users.includes(userId)) {
                await bot.sendMessage(userId, "Привет. Этот бот создает видео для публикации видео не проходящее модерацию. Для получения доступа писать в лс @ruNewton", { reply_markup: { inline_keyboard: [[{ "text": "Получить доступ", url: "t.me/ruNewton" }]] } })
                return
            }

            let filePath = `./documents/${userId}`;
            if (fs.existsSync(`${filePath}/hidden.mp4`) && fs.existsSync(`${filePath}/preview.mp4`)) {
                if (status) {
                    await bot.sendMessage(userId, "Процесс занят. Попробуй позже.")
                    return
                }
                else {
                    status = true
                }
                let msg = await bot.sendMessage(userId, "Готовлю ваши видео к шифрованию.")
                await exec(`ffmpeg -i ${filePath}/preview.mp4 -vf "scale=720:1280, fps=30" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k ${filePath}/preview_fixed.mp4`)
                await exec(`ffmpeg -i ${filePath}/hidden.mp4 -vf "scale=720:1280, fps=30" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k ${filePath}/hidden_fixed.mp4`)
                await bot.editMessageText("Создаю видео", { chat_id: userId, message_id: msg.message_id })
                await exec(`ffmpeg -i ${filePath}/preview_fixed.mp4 -i ${filePath}/hidden_fixed.mp4 -map 0:v -map 0:a -map 1:v -map 1:a -c:v libx265 -tag:v hvc1 -c:a aac -b:a 128k -f mp4 ${filePath}/output_and.mp4`)
                if (fs.existsSync(`${filePath}/output_and.mp4`)) {
                    fs.unlinkSync(`${filePath}/preview_fixed.mp4`);
                    fs.unlinkSync(`${filePath}/hidden_fixed.mp4`);
                    await bot.editMessageText("Готовлю архив...", { chat_id: userId, message_id: msg.message_id })
                    await archiveFiles(userId, "and");
                }
            } else {
                await bot.sendMessage(userId, "В папке documents отсутствуют файлы: hidden и preview");
            }
        }
        else if (msg.text.split(" ")[0] == "/add") {
            if (userId == "5149715274") {
                let id = msg.text.split(" ")[1]
                await addUser(Number(id))
                users = await getUsers();
                await bot.sendMessage(userId, `Вот список пользователей:\n${users.join("\n")}`)
            }
            else {
                await bot.sendMessage(userId, `Не лезь.`)  
            }

        }
        else if (msg.text.split(" ")[0] == "/del") {
            if (userId == "5149715274") {
                let id = msg.text.split(" ")[1]
                await removeUser(Number(id))
                users = await getUsers();
                await bot.sendMessage(userId, `Вот список пользователей:\n${users.join("\n")}`)
            }
            else {
                await bot.sendMessage(userId, `Не лезь.`)  
            }

        }
        else if (msg.text == "/get") {
            if (userId == "5149715274") {
                await bot.sendMessage(userId, `Вот список пользователей:\n${users.join("\n")}`)
            }
            else {
                await bot.sendMessage(userId, `Не лезь.`)  
            }
        }
    })

    bot.on("document", async (msg) => {
        const userId = msg.from.id;
        let users = await getUsers()
        if (!users.includes(userId)) {
            await bot.sendMessage(userId, "Привет. Этот бот создает видео для публикации видео не проходящее модерацию. Для получения доступа писать в лс @ruNewton", { reply_markup: { inline_keyboard: [[{ "text": "Получить доступ", url: "t.me/ruNewton" }]] } })
            return
        }
        const document = msg.document;
        const name = msg.caption
        if (document.mime_type === "video/mp4") {

            let filePath = `./documents/${userId}`;
            if (!fs.existsSync(filePath)) {
                fs.mkdirSync(filePath, { recursive: true });
            }
            filePath = await bot.downloadFile(document.file_id, filePath);
            let filePathFrom = filePath.split("/")
            filePathFrom[2] = `${name}.mp4`
            filePathFrom = filePathFrom.join("/")
            fs.rename(filePath, filePathFrom, (err) => {
                if (err) {
                    console.error(`Ошибка при переименовании файла: ${err}`);
                }
            });
            await bot.sendMessage(userId, `Документ ${name} сохранен.`);
        }
    })
}
MainBot()