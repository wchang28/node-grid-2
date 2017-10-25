let input = "";
process.stdin.on("end", () => {
    console.log("input=" + input);
    process.exit(0);
}).on("data", (s: string) => {
    input += s;
})