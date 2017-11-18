CREATE TABLE [dbo].[GridJobs](
	[jobId] [bigint] IDENTITY(1,1) NOT NULL,
	[description] [varchar](250) NULL,
	[cookie] [varchar](250) NULL,
	[userId] [varchar](100) NOT NULL,
	[userName] [varchar](200) NULL,
	[priority] [int] NOT NULL,
	[submitTime] [datetime] NOT NULL,
	[aborted] [bit] NOT NULL,
 CONSTRAINT [PK_GridJobs] PRIMARY KEY CLUSTERED 
(
	[jobId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]

GO

CREATE TABLE [dbo].[GridJobTasks](
	[jobId] [bigint] NOT NULL,
	[index] [int] NOT NULL,
	[cmd] [varchar](max) NOT NULL,
	[cookie] [varchar](250) NULL,
	[stdin] [varchar](max) NULL,
	[envJSON] [varchar](max) NULL,
	[status] [varchar](50) NOT NULL,
	[nodeId] [varchar](50) NULL,
	[nodeName] [varchar](250) NULL,
	[pid] [int] NULL,
	[startTime] [datetime] NULL,
	[finishTime] [datetime] NULL,
	[durationSeconds] [bigint] NULL,
	[success] [bit] NULL,
	[retCode] [int] NULL,
	[stdout] [text] NULL,
	[stderr] [text] NULL,
 CONSTRAINT [PK_GridJobTasks] PRIMARY KEY CLUSTERED 
(
	[jobId] ASC,
	[index] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]

GO

CREATE TABLE [dbo].[GridProfile](
	[id] [varchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[enabled] [bit] NOT NULL,
	[name] [varchar](250) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
	[priority] [int] NOT NULL,
	[canSubmitJob] [bit] NOT NULL,
	[canKillOtherUsersJob] [bit] NOT NULL,
	[canStartStopDispatching] [bit] NOT NULL,
	[canOpenCloseQueue] [bit] NOT NULL,
	[canEnableDisableNode] [bit] NOT NULL,
	[canChangeAutoScalerSettings] [bit] NOT NULL,
 CONSTRAINT [PK_GridProfile] PRIMARY KEY CLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]

GO

/****** Object:  Index [IX_GridProfile]    Script Date: 3/22/2017 10:31:57 AM ******/
CREATE NONCLUSTERED INDEX [IX_GridProfile] ON [dbo].[GridProfile]
(
	[enabled] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]

GO


CREATE TABLE [dbo].[GridUserProfile](
	[userId] [varchar](100) NOT NULL,
	[enabled] [bit] NOT NULL,
	[profileId] [varchar](100) NOT NULL,
 CONSTRAINT [PK_GridUserProfile_1] PRIMARY KEY CLUSTERED 
(
	[userId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]

GO

CREATE view [dbo].[GridJobsView]
as
with stat as
(
	select
	[jobId]
	,[numTasks]=count(*)
	,[startTime]=min([startTime])
	,[maxFinishTime]=max([finishTime])
	,[numTasksFinished]=cast(sum(iif([status]='FINISHED',1,0)) as int)
	,[numSuccess]=cast(sum(iif([success] is null, 0, [success])) as int)
	from [dbo].[GridJobTasks] (nolock)
	group by [jobId]
)
,stat2 as
(
	select
	jobs.[description]
	,jobs.[cookie]
	,jobs.[userId]
	,jobs.[priority]
	,jobs.[submitTime]
	,[status]=iif(jobs.[aborted]=1,'ABORTED',iif(stat.[numTasks]=stat.[numTasksFinished],'FINISHED', iif(stat.[startTime] is null, 'SUBMITTED', 'STARTED')))
	,stat.*
	,jobs.[userName]
	from stat
	left join [dbo].[GridJobs] (nolock) jobs
	on stat.[jobId]=jobs.[jobId]
)
select
stat2.[jobId]
,stat2.[description]
,stat2.[cookie]
,stat2.[userId]
,stat2.[priority]
,stat2.[submitTime]
,stat2.[status]
,stat2.[numTasks]
,stat2.[numTasksFinished]
,stat2.[startTime]
,[finishTime]=iif(stat2.[status]='FINISHED', stat2.[maxFinishTime], null)
,[durationSeconds]=iif(stat2.[status]='FINISHED', DATEDIFF(s, stat2.[startTime], stat2.[maxFinishTime]), null)
,[success]=cast(iif(stat2.[status]='ABORTED', 0, iif(stat2.[numTasks]=stat2.[numSuccess],1,0)) as bit)
,[completePct]=cast(stat2.[numTasksFinished] as float)/cast(stat2.[numTasks] as float) * 100.0
,[userName]
from stat2;

GO

CREATE VIEW [dbo].[vActiveGridProfile]
AS
select
 [id]
,[name]
,[priority]
,[canSubmitJob]
,[canKillOtherUsersJob]
,[canStartStopDispatching]
,[canOpenCloseQueue]
,[canEnableDisableNode]
,[canChangeAutoScalerSettings]
FROM [dbo].[GridProfile] (nolock)
where [enabled]=1

GO

CREATE FUNCTION [dbo].[func_GridIsUserSignedUpForApp]
(
	@userId varchar(100)
)
RETURNS bit
AS
BEGIN
	declare @ret bit
	if exists (select [userId] from [dbo].[GridUserProfile] (nolock) where [userId]=@userId and [enabled]=1)
		set @ret=1
	else
		set @ret=0
	return @ret
END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGridJobTask]
	@jobId bigint
	,@taskIndex bigint
	,@nodeId varchar(50) = null
	,@nodeName varchar(250) = null
	,@pid int = null
	,@retCode int = null
	,@stdout text = null
	,@stderr text = null
AS
BEGIN

	SET NOCOUNT ON;

	if not @nodeId is null -- dispatched
	begin
		-- IDLE --> DISPATCHED
		update [dbo].[GridJobTasks]
		set
		[nodeId]=@nodeId
		,[nodeName]=@nodeName
		,[status]='DISPATCHED'
		where
		[jobId]=@jobId
		and [index]=@taskIndex
		and [status]='IDLE'

		-- returns ITaskExecParams
		select
		[cmd]
		,[stdin]
		,[envJSON]
		from [dbo].[GridJobTasks] (nolock)
		where
		[jobId]=@jobId
		and [index]=@taskIndex
	end
	else
	begin
		if @retCode is null -- mark task start
		begin
			-- DISPATCHED --> RUNNING
			update [dbo].[GridJobTasks]
			set
			[pid]=@pid
			,[startTime]=getdate()
			,[status]='RUNNING'
			where
			[jobId]=@jobId
			and [index]=@taskIndex
			and [status]='DISPATCHED'
		end
		else
		begin -- mark task end
			-- RUNNING --> FINISHED
			declare @finishTime datetime
			set @finishTime=getdate()

			update [dbo].[GridJobTasks]
			set
			[pid]=@pid
			,[status]='FINISHED'
			,[finishTime]=@finishTime
			,[durationSeconds]=iif([startTime] is null, 0, DATEDIFF(s, [startTime], @finishTime))
			,[success]=iif(@retCode=0, 1, 0)
			,[retCode]=@retCode
			,[stdout]=@stdout
			,[stderr]=@stderr
			where
			[jobId]=@jobId
			and [index]=@taskIndex

			update [dbo].[GridJobTasks]
			set
			[startTime]=@finishTime
			where
			[jobId]=@jobId
			and [index]=@taskIndex
			and [startTime] is null

		end -- mark task finished
	end -- mark task finished

END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGridSubmitJob]
	@userId varchar(100)
	,@userName varchar(200)
	,@priority int
	,@jobXML xml
AS
BEGIN
	SET NOCOUNT ON;
	
	declare @tmp table
	(
		[id] bigint identity(0,1)
		,[cmd] varchar(max)
		,[cookie] varchar(256)
		,[stdin] varchar(max)
		,[envJSON] varchar(max)
	)

	insert into @tmp
	([cmd],[cookie],[stdin],[envJSON])
	select
	[cmd]=a.b.value('@c', 'varchar(max)')
	,[cookie]=a.b.value('@k', 'varchar(250)')
	,[stdin]=a.b.value('@i', 'varchar(max)')
	,[envJSON]=a.b.value('@e', 'varchar(max)')
	FROM @jobXML.nodes('/job/t') a(b)

	declare @numTasks int
	select @numTasks=max([id])+1 from @tmp

	if (@numTasks is null)
	begin
		select
		[err]=1
		,[error]='no task to run'
		return
	end

	select
	[err]=0
	,[error]=null
	-- return

	declare @description varchar(250)
	declare @cookie varchar(250)
	declare @jobId bigint

	select
	@description=a.b.value('@description', 'varchar(250)')
	,@cookie=a.b.value('@cookie', 'varchar(250)') 
	FROM @jobXML.nodes('/job') a(b)

	if @description = '' set @description=null
	if @cookie = '' set @cookie=null
	insert into [dbo].[GridJobs]
	([description],[cookie],[userId],[userName],[priority],[submitTime],[aborted])
	values (@description, @cookie, @userId, @userName, @priority, getdate(), 0)

	set @jobId = @@IDENTITY

	delete from [dbo].[GridJobTasks] where [jobId]=@jobId

	insert into [dbo].[GridJobTasks]
	([jobId],[index],[cmd],[cookie],[stdin],[envJSON],[status])
	select
	[jobId]=@jobId
	,[index]=[id]
	,[cmd]
	,[cookie]=iif([cookie]='', null, [cookie])
	,[stdin]=iif([stdin]='', null, [stdin])
	,[envJSON]=iif([envJSON]='', null, [envJSON])
	,[status]='IDLE'
	from @tmp
	order by [id] asc

	select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)

END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGridReSubmitJob]
	@userId varchar(100)
	,@userName varchar(200)
	,@priority int
	,@oldJobId bigint
	,@failedTasksOnly bit = 0
AS
BEGIN
	SET NOCOUNT ON;

	IF not EXISTS (SELECT [jobId] from [dbo].[GridJobs] WHERE [jobId] = @oldJobId) 
	begin
		select
		[err]=1
		,[error]='bad job id'
		return
	end

	declare @tmp table
	(
		[id] bigint identity(0,1)
		,[cmd] varchar(max)
		,[cookie] varchar(256)
		,[stdin] varchar(max)
		,[envJSON] varchar(max)
	)

	insert into @tmp
	([cmd],[cookie],[stdin],[envJSON])
	select
	[cmd]
	,[cookie]
	,[stdin]
	,[envJSON]
	FROM [dbo].[GridJobTasks] (nolock)
	where
	[jobId]=@oldJobId
	and 1=iif(@failedTasksOnly=1, iif(isnull([success], 0) = 1, 0, 1) , 1)

	declare @numTasks int
	select @numTasks=max([id])+1 from @tmp

	if (@numTasks is null)
	begin
		select
		[err]=1
		,[error]='no task to run'
		return
	end
		
	select
	[err]=0
	,[error]=null
	-- return

	declare @description varchar(250)
	declare @cookie varchar(250)
	declare @jobId bigint

	select
	@description=[description]
	,@cookie=[cookie]
	FROM [dbo].[GridJobs] (nolock)
	where [jobId]=@oldJobId

	insert into [dbo].[GridJobs]
	([description],[cookie],[userId],[userName],[priority],[submitTime],[aborted])
	values (@description, @cookie, @userId, @userName, @priority, getdate(), 0)

	set @jobId = @@IDENTITY

	delete from [dbo].[GridJobTasks] where [jobId]=@jobId

	insert into [dbo].[GridJobTasks]
	([jobId],[index],[cmd],[cookie],[stdin],[envJSON],[status])
	select
	[jobId]=@jobId
	,[index]=[id]
	,[cmd]
	,[cookie]
	,[stdin]
	,[envJSON]
	,[status]='IDLE'
	from @tmp
	order by [id] asc

	select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)

END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSKillJob]
	@jobId bigint
	,@markJobAborted bit = 0
AS
BEGIN
	SET NOCOUNT ON;

	if @markJobAborted=1
	begin
		update [dbo].[GridJobs]
		set
		[aborted]=1
		where [jobId] = @jobId
	end

	select
	[nodeId]
	,[pid]
	from [dbo].[GridJobTasks] (nolock)
	where
	[jobId]=@jobId
	and [status]='RUNNING'
	and [pid] is not null
	and [pid] > 0

	select * from [dbo].[fnc_NodeJSGridGetJobProgress](@jobId)

END

GO

CREATE FUNCTION [dbo].[fnc_NodeJSGridGetJobInfo]
(	
	@jobId bigint
)
RETURNS TABLE 
AS
RETURN 
(
	select
	*
	from [dbo].[GridJobsView]
	where [jobId]=@jobId
)

GO

CREATE FUNCTION [dbo].[fnc_NodeJSGridGetJobProgress]
(	
	@jobId bigint
)
RETURNS TABLE 
AS
RETURN 
(
	select
	[jobId]
	,[status]
	,[numTasks]
	,[numTasksFinished]
	,[success]
	from [dbo].[GridJobsView]
	where [jobId]=@jobId
)

GO

CREATE FUNCTION [dbo].[fnc_NodeJSGridMultiJobsProgress]
(	
	@xml xml
)
RETURNS TABLE 
AS
RETURN 
(
	with jobs as
	(
		select
		[jobId]=a.b.value('@i', 'bigint') 
		FROM @xml.nodes('/jobs/j') a(b)

	)
	select
	p.*
	from jobs j
	cross apply [dbo].[fnc_NodeJSGridGetJobProgress](j.jobId) p
)

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGridGetUserProfile]
	@userId varchar(100)
AS
BEGIN
	SET NOCOUNT ON;

	select
	ap.*
	from [dbo].[GridUserProfile] up (nolock)
	inner join [dbo].[vActiveGridProfile] ap (nolock)
	on up.[userId]=@userId and up.[profileId]=ap.[id]

END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGetJobResult]
	@jobId bigint
AS
BEGIN
	SET NOCOUNT ON;

	select
	[t]=[index]
	,[cookie]
	,[success]
	,[retCode]
	,[stdout]
	,[stderr]
	from [dbo].[GridJobTasks] (nolock)
	where [jobId] = @jobId
	order by [index] asc

END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGetMostRecentJobs]
AS
BEGIN
	SET NOCOUNT ON;

	select top 100
	*
	from [dbo].[GridJobsView]
	order by [jobId] desc

END

GO

CREATE PROCEDURE [dbo].[stp_NodeJSGridGetTaskResult]
	@jobId bigint
	,@taskIndex bigint
AS
BEGIN
	SET NOCOUNT ON;

	select
	[t]=[index]
	,[cookie]
	,[success]
	,[retCode]
	,[stdout]
	,[stderr]
	from [dbo].[GridJobTasks] (nolock)
	where
	[jobId]=@jobId
	and [index]=@taskIndex

END

GO