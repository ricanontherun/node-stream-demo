const app = new (require('express'))
const fs = require('fs')
const mime = require('mime-types')
const path = require('path')

let BASE_ASSET_PATH = process.env.BASE_ASSET_PATH || './assets'

// Property cache for files.
const filePropertiesMap = {}

/**
 * Retrieve the properties for a file.
 *
 * @param {String} path
 * @returns {*}
 */
function getFileProperties(path) {
  if (filePropertiesMap.hasOwnProperty(path)) {
    return filePropertiesMap[path]
  }

  let stat

  try {
    stat = fs.statSync(path)
  } catch(err) {
    return err
  }

  const mimeType = mime.lookup(path)

  if (!mimeType) {
    return new Error(`Failed to deduce mime-type for '${path}'`)
  }

  stat.mimeType = mimeType
  filePropertiesMap[path] = stat

  return stat
}

function validateQuery(req) {
  return req.query.hasOwnProperty('f')
}

/**
 * Parse an HTTP Range header into a series of start/end ranges.
 *
 * @param header
 * @param stat
 * @param cb
 * @returns {*}
 */
function parseRangeHeader(header, stat, cb) {
  const rangeStrings = header
    // Assuming byte unit here.
    .replace(/bytes=/, '')
    .split(',')
    .map(range => range.trim())

  const ranges = []

  rangeStrings.forEach(rangeString => {
    const range = rangeString.split('-')

    const start = parseInt(range[0])
    const end = range[1] ? parseInt(range[1]) : stat.size - 1

    // As soon as we encounter an invalid range, exit the routine.
    if (isNaN(start) || isNaN(end) || start < 0 || end >= stat.size) {
      return cb(new Error(`Invalid range provided: ${start}-${end}`))
    }

    ranges.push({start, end})
  })

  return cb(null, ranges)
}

function handleStream(req, res) {
  if (!validateQuery(req)) {
    return res.status(400).send("Missing file parameter.")
  }

  const filePath = path.resolve(path.join(BASE_ASSET_PATH, req.query['f']))

  let stat = getFileProperties(filePath)
  if (stat instanceof Error) {
    // TODO: Address the error better when formulating a response.
    return res.status(404).end()
  }

  const fileSize = stat.size
  const rangeHeader = req.headers.range

  // If no range header was provided, stream the entire file back.
  if (!rangeHeader) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': stat.mimeType
    })

    return fs.createReadStream(filePath).pipe(res)
  }

  parseRangeHeader(rangeHeader, stat, (err, ranges) => {
    if (err) {
      return res.status(416).send(err.message)
    }

    fs.open(filePath, 'r', (err, fd) => {
      if (err) {
        // TODO: Return a better response on failure to open file.
        return res.status(404).end()
      }

      ranges.forEach(({start, end}) => {
        const chunkSize = (end - start) + 1
        const buffer = Buffer.alloc(chunkSize)

        fs.read(fd, buffer, 0, chunkSize, start, (err, bytesRead, buffer) => {
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': bytesRead,
            'Content-Type': stat.mimeType
          })

          res.write(buffer, 'binary')
          res.end()
        })
      })
    })
  })
}

app.get('/stream', handleStream)

const httpPort = process.env.HTTP_PORT || 3000

app.listen(httpPort, (err) => {
  if (err) {
    return console.error(`Failed to start server: ${err}`)
  }

  console.log(`Server started, listening on ${httpPort}`)
})