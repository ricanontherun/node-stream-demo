const VP = document.getElementById('videoPlayer') // player

const items = document.getElementById('list').getElementsByTagName('li')

for (let i = 0; i < items.length; ++i) {
  items[i].addEventListener('click', (el) => {
    const fileName = el.srcElement.innerText

    VP.src = `http://localhost:3000/stream?f=${fileName}`
    VP.load()
  })
}

