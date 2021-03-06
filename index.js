const core = require('@actions/core');
const github = require('@actions/github');
const Fs = require("fs/promises");
const fetch = require("node-fetch");


async function apiCall(api, body) {
    const url = `https://library.jmonkeyengine.org/${api}`;
    // console.info("Fetch ", url, "with payload", body);
    const data = await fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json"
        }
    }).then(res => res.json());
    // console.info("Response", data);
    if (data.error) throw data.error;
    return data;

}

async function main() {
    try {
        const data = {};
        if (core.getInput('data')) {
            const inputData = JSON.parse(await Fs.readFile(core.getInput('data')));
            for (const [k, v] of Object.entries(inputData)) {
                if (v.value) data[k] = v.value;
                else data[k] = v;
            }
        }

        const media = [];
        if (core.getInput('media-data-array')) {
            const inputMediaR = JSON.parse(await Fs.readFile(core.getInput('media-data-array')));
            for (const inputMedia of inputMediaR) {
                const newMedia = {};
                for (const [k, v] of Object.entries(inputMedia)) {
                    if (v.value) newMedia[k] = v.value;
                    else newMedia[k] = v;
                }
                media.push(newMedia);
            }
        }

        const userId = core.getInput('userId');
        const token = core.getInput('token');
        const authKey = core.getInput('authKey');
        const authId = core.getInput('authId');
        
        let repo = core.getInput('fetch-repo') ? (core.getInput('fetch-repo') == "current" ? github.context.repo : core.getInput('fetch-repo')) : undefined;
        if(repo=="nil"||repo=="null"||repo=="undefined") repo=undefined;
        
        let branch = core.getInput('branch') ? core.getInput('branch') : github.context.branch;

        
        if (repo) {
            // import entry data
            const importedEntry = await apiCall("ext-import/github/entry", {
                repo: `${repo.owner}/${repo.repo}`,
                userId: userId,
                token: token,
                branch: branch
            });
            for (const [key, value] of Object.entries(importedEntry)) {
                if (!data[key]) data[key] = value;
            }


            // import media
            const importedMedia = [];
            {
                for (let mediaId = 0; ; mediaId++) {
                    try {
                        const mediaData = await apiCall("ext-import/github/media", {
                            repo: `${repo.owner}/${repo.repo}`,
                            userId: userId,
                            token: token,
                            mediaId: mediaId,
                            branch: branch
                        });
                        importedMedia.push(mediaData);
                    } catch (e) {
                        break;
                    }
                }
                importedMedia.forEach(m => media.push(m));
            }

        }

        // Publish
        {
            // Fetch old data
            try {
                let oldData = await apiCall("entry/get", {
                    userId: userId,
                    entryId: data.entryId,
                    authId: authId,
                    authKey: authKey
                });

                for (const [key, value] of Object.entries(oldData)) {
                    if (!data[key]) {
                        data[key] = value;
                    }
                }

            } catch (e) {
                console.error(e);
            }

            // Update with new data
            {
                data.authId = authId;
                data.authKey = authKey;
                data.suspended = "Updating..."; // suspend during update
                await apiCall("entry/set", data);
            }
        }

        // update media
        for (const mediaData of media) {
            mediaData.authId = authId;
            mediaData.authKey = authKey;
            await apiCall("media/set", mediaData);
        }


        // publish entry
        {
            data.suspended = undefined;
            await apiCall("entry/set", data);
        }

    } catch (error) {
        core.setFailed(error.message);
    }
}
main();