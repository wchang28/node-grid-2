@echo off
call ".\node_modules\.bin\browserify.cmd" .\js\ui\main.js -o .\public\js\bundle.js