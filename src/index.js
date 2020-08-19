import * as THREE from 'three'
import { ShapePath, MathUtils } from 'three'

const MODULE_NAME = 'three-typeable-text'

export default class ThreeEditableText
{
    constructor(args = {})
    {
        // mandatory

        this.camera = args.camera
        this.font = args.font
        
        // settings

        this.string = args.string || ''
        this.fontScale = 1
        this.material = args.material || new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
        this.useDocumentListeners = args.useDocumentListeners === undefined ? true : args.useDocumentListeners
        this.align = args.align === undefined ? 'center' : args.align.toLowerCase()
        
        // internals

        this.backgroundMaterial = new THREE.MeshBasicMaterial({ visible: false })
        this.midpoint = 0

        this.mouse = { x: 0, y: 0 }

        this.group = new THREE.Group()
        this.letters = new THREE.Group()
        this.group.add(this.letters)
        
        this.vec3 = new THREE.Vector3()
        
        this.isTyping = false

        this.blinkingClock = new THREE.Clock()
        this.blinkingFrequency = 0.5
        this.blinkingLastChange = 0

        this.cursorPosition = new THREE.Vector3()
        this.cursorTextIndex = 0
        this.cursorVisible = false

        this.createText()
        this.createCursor()
        this.makeCursorVisible(false)

        if(this.useDocumentListeners)
            this.addDocumentListeners()
    }

    // === //
    // API //
    // === //

    addDocumentListeners()
    {
        this.raycaster = new THREE.Raycaster()

        this.onDocumentMouseDown = this.onDocumentMouseDown.bind(this)
        this.onDocumentMouseMove = this.onDocumentMouseMove.bind(this)
        // this.onDocumentTouchStart = this.onDocumentTouchStart.bind(this)
        // this.onDocumentTouchMove = this.onDocumentTouchMove.bind(this)
        this.onDocumentKeyPress = this.onDocumentKeyPress.bind(this)
        this.onDocumentKeyDown = this.onDocumentKeyDown.bind(this)

        document.addEventListener( 'mousedown', this.onDocumentMouseDown, false )
        document.addEventListener( 'mousemove', this.onDocumentMouseMove, false )
        // document.addEventListener( 'touchstart', this.onDocumentTouchStart, false )
        // document.addEventListener( 'touchmove', this.onDocumentTouchMove, false )
        document.addEventListener( 'keypress', this.onDocumentKeyPress, false )
        document.addEventListener( 'keydown', this.onDocumentKeyDown, false )
    }

    removeDocumentListeners()
    {
        this.raycaster = undefined

        document.removeEventListener( 'mousedown', this.onDocumentMouseDown )
        document.removeEventListener( 'mousemove', this.onDocumentMouseMove )
        // document.removeEventListener( 'touchstart', this.onDocumentTouchStart )
        // document.removeEventListener( 'touchmove', this.onDocumentTouchMove )
        document.removeEventListener( 'keypress', this.onDocumentKeyPress )
        document.removeEventListener( 'keydown', this.onDocumentKeyDown )
    }
    
    setText(text)
    {
        this.string = text
        this.textMesh = this.createText()
    }

    updateCursor()
    {
        if(this.isTyping)
        {
            if(this.blinkingLastChange + this.blinkingFrequency < this.blinkingClock.getElapsedTime())
            {
                this.makeCursorVisible(!this.cursorVisible)
            }
        }
    }

    actionType(keyCode)
    {
        this.string = [this.string.slice(0, this.cursorTextIndex), String.fromCharCode(keyCode), this.string.slice(this.cursorTextIndex)].join('')
        this.createText()
        this.cursorTextIndex += 1
        this.refreshCursor()
    }

    actionBackspace()
    {
        if(this.cursorTextIndex >= this.letters.length - 1) return
        event.preventDefault()
        this.string = [this.string.slice(0, this.cursorTextIndex), this.string.slice(this.cursorTextIndex + 1)].join('')
        this.createText()
        this.refreshCursor()
    }

    actionDelete()
    {
        if(this.cursorTextIndex === 0) return
        event.preventDefault()
        this.string = [this.string.slice(0, this.cursorTextIndex - 1), this.string.slice(this.cursorTextIndex)].join('')
        this.createText()
        this.cursorTextIndex -= 1
        this.refreshCursor()
    }

    actionMoveCursor(amount)
    {
        this.cursorTextIndex += amount
        this.refreshCursor()
        this.makeCursorVisible(true)
    }

    actionClick(point)
    {
        if(point)
        {
            this.getCursorIndexByPoint(this.backgroundMesh.worldToLocal(point))
            this.refreshCursor()
            this.isTyping = true
            this.makeCursorVisible(true)
        }
        else
        {
            this.isTyping = false
            this.makeCursorVisible(false)
        }
    }

    getObject()
    {
        return this.group
    }

    // ========= //
    // INTERNALS //
    // ========= //

    createText()
    {
        while(this.letters.children.length > 0)
        {
            this.letters.remove(this.letters.children[0])
        }

        if(this.string === undefined || typeof this.string !== 'string')
        {
            console.error('Error in ' + MODULE_NAME + ' : text empty')
            return
        }

        const chars = Array.from ? Array.from( this.string ) : String( this.string ).split( '' ) // workaround for IE11, see #13988

        const scale = this.fontScale / this.font.data.resolution
        this.line_height = ( this.font.data.boundingBox.yMax - this.font.data.boundingBox.yMin + this.font.data.underlineThickness ) * scale

        let offsetX = 0, offsetY = 0, biggestX = 0

        for ( let i = 0; i < chars.length; i ++ )
        {
            const char = chars[ i ]
            if ( char === '\n' )
            {
                offsetX = 0
                offsetY -= this.line_height
            }
            else
            {
                const ret = this.createPath(char, scale, offsetX, offsetY, this.font.data)
                
                let geometry = new THREE.ShapeBufferGeometry(ret.path.toShapes())
                let mesh = new THREE.Mesh(geometry, this.material)
                mesh.userData.offset = { x: offsetX, y: offsetY, width: ret.offsetX, height: this.line_height }

                this.letters.add(mesh)

                offsetX += ret.offsetX

                if(offsetX > biggestX)
                    biggestX = offsetX
            }
        }

        let backgroundGeo = new THREE.PlaneBufferGeometry(biggestX, (-offsetY + this.line_height))
        backgroundGeo.translate(biggestX / 2, (-offsetY + this.line_height) / 2, 0)
        this.backgroundMesh = new THREE.Mesh(backgroundGeo, this.backgroundMaterial)
        this.group.add(this.backgroundMesh)

        if(this.align === 'center')
        {
            this.group.position.setX(-this.backgroundMesh.geometry.parameters.width / 2)
        }
        else if(this.align === 'right')
        {
            this.group.position.setX(-this.backgroundMesh.geometry.parameters.width)
        }
    }

    createCursor()
    {
        let size = this.line_height

        this.cursorGeometry = new THREE.PlaneBufferGeometry(size * 0.1 * 0.75, size * 0.75)
        this.cursorGeometry.translate(0, size * 0.5 * 0.75, 0)
        this.cursorMesh = new THREE.Mesh(this.cursorGeometry, this.material)
        this.group.add(this.cursorMesh)
    }

    refreshCursor()
    {
        if(this.cursorTextIndex < 0)
            this.cursorTextIndex = 0
        
        if(this.cursorTextIndex > this.letters.children.length)
            this.cursorTextIndex = this.letters.children.length
        
        if(this.cursorTextIndex === 0)
        {
            this.cursorMesh.position.set(0, 0, 0)
        }
        else if(this.cursorTextIndex >= this.letters.children.length)
        {
            let child = this.letters.children[this.letters.children.length - 1]
            this.cursorMesh.position.set(child.userData.offset.x + child.userData.offset.width, child.userData.offset.y, 0)
        }
        else
        {
            let child = this.letters.children[this.cursorTextIndex]
            this.cursorMesh.position.set(child.userData.offset.x, child.userData.offset.y, 0)
        }
    }

    makeCursorVisible(visible)
    {
        this.cursorVisible = visible
        this.cursorMesh.visible = this.cursorVisible
        this.blinkingLastChange = this.blinkingClock.getElapsedTime()
    }

    getCursorIndexByPoint(point)
    {
        for(let i in this.letters.children)
        {
            let child = this.letters.children[Number(i)]
            if(
                point.x >= child.userData.offset.x
                &&  point.y >= child.userData.offset.y 
                &&  point.x <= child.userData.offset.x + (child.userData.offset.width * 0.5)
                &&  point.y <= child.userData.offset.y + child.userData.offset.height
            )
            {
                this.cursorTextIndex = Number(i)
                return
            } 
            else if(
                point.x >= child.userData.offset.x + (child.userData.offset.width * 0.5)
                &&  point.y >= child.userData.offset.y 
                &&  point.x <= child.userData.offset.x + child.userData.offset.width
                &&  point.y <= child.userData.offset.y + child.userData.offset.height
            )
            {
                this.cursorTextIndex = Number(i) + 1
                return
            }
        }
    }

    onDocumentMouseDown(event)
    {
        event.preventDefault()

        this.raycaster.setFromCamera(this.mouse, this.camera)
        let intersections = this.raycaster.intersectObject(this.backgroundMesh)
        this.actionClick(intersections.length > 0 ? intersections[0].point : false)
    }

    onDocumentMouseMove(event)
    {
        this.mouse.x = 2 * (event.clientX / window.innerWidth - 0.5)
        this.mouse.y = -2 * (event.clientY / window.innerHeight - 0.5)
    }

    onDocumentKeyDown(event)
    {
        var keyCode = event.keyCode
        if(keyCode == 8) // backspace
        {
            this.actionDelete()
            return false
        }
        if(keyCode == 46) // delete
        {
            this.actionBackspace()
            return false
        }
        if(keyCode == 37) // backspace
        {
            this.actionMoveCursor(-1)
        }
        if(keyCode == 39) // backspace
        {
            this.actionMoveCursor(1)
        }
    }

    onDocumentKeyPress(event)
    {
        var keyCode = event.which
        
        if(keyCode == 8 || keyCode == 46) // backspace
        {
            event.preventDefault()
        }
        else
        {
            this.actionType(keyCode)
        }
    }

    // TODO
    // onDocumentTouchStart(event)
    // {
    //     if (event.touches.length == 1)
    //     {
    //     }
    // }

    // onDocumentTouchMove(event)
    // {
    //     if(event.touches.length == 1)
    //     {
    //     }
    // }

    // Taken from THREE.Font - need to see if there is a way to expose this function natively
    createPath( char, scale, offsetX, offsetY, data ) {

        const glyph = data.glyphs[ char ] || data.glyphs[ '?' ]

        if ( ! glyph ) {

            console.error( 'FontExtension: character "' + char + '" does not exists in font family ' + data.familyName + '.' )

            return

        }

        const path = new ShapePath()

        let x, y, cpx, cpy, cpx1, cpy1, cpx2, cpy2

        if ( glyph.o ) {

            const outline = glyph._cachedOutline || ( glyph._cachedOutline = glyph.o.split( ' ' ) )

            for ( let i = 0, l = outline.length; i < l; ) {

                const action = outline[ i ++ ]

                switch ( action ) {

                    case 'm': // moveTo

                        x = outline[ i ++ ] * scale + offsetX
                        y = outline[ i ++ ] * scale + offsetY

                        path.moveTo( x, y )

                        break

                    case 'l': // lineTo

                        x = outline[ i ++ ] * scale + offsetX
                        y = outline[ i ++ ] * scale + offsetY

                        path.lineTo( x, y )

                        break

                    case 'q': // quadraticCurveTo

                        cpx = outline[ i ++ ] * scale + offsetX
                        cpy = outline[ i ++ ] * scale + offsetY
                        cpx1 = outline[ i ++ ] * scale + offsetX
                        cpy1 = outline[ i ++ ] * scale + offsetY

                        path.quadraticCurveTo( cpx1, cpy1, cpx, cpy )

                        break

                    case 'b': // bezierCurveTo

                        cpx = outline[ i ++ ] * scale + offsetX
                        cpy = outline[ i ++ ] * scale + offsetY
                        cpx1 = outline[ i ++ ] * scale + offsetX
                        cpy1 = outline[ i ++ ] * scale + offsetY
                        cpx2 = outline[ i ++ ] * scale + offsetX
                        cpy2 = outline[ i ++ ] * scale + offsetY

                        path.bezierCurveTo( cpx1, cpy1, cpx2, cpy2, cpx, cpy )

                        break

                }

            }

        }

        return { offsetX: glyph.ha * scale, path: path }
    }
}